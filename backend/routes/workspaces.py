"""Settings, independent draft checkpoints, and complete workspace recovery."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Literal
from pathlib import Path
from backend.services.atomic_files import workspace_lock
from backend.services.file_settings import get_file_settings, update_file_settings
from backend.services.workspace_session import workspace_scope, session_info, set_session, board_directory
from backend.services.draft_store import write_snapshot, latest_snapshot, recovery_records, read_snapshot, board_folder
from backend.services.draft_store import reserve_snapshot, release_snapshot, acknowledge_revision
from backend.services.draft_resources import restore_resources
from backend.services.storage import load_data_from_disk, get_revision, force_replace_all, save_workspace_extras

router = APIRouter(prefix="/api", tags=["workspaces"], dependencies=[Depends(workspace_scope)])


class FileSettingsUpdate(BaseModel):
    save_dir: str | None = None
    temp_dir: str | None = None
    autosave_enabled: bool | None = None
    idle_seconds: int | None = Field(default=None, ge=1, le=30)
    retention_count: int | None = Field(default=None, ge=1, le=20)


class DraftPayload(BaseModel):
    workspace_id: str
    cards: list[dict]
    groups: list[dict]
    viewport: dict | None = None
    pins: list[dict] = Field(default_factory=list)
    base_revision: int | None = None
    client_revision: int = 0
    force: bool = False


class RestorePayload(BaseModel):
    workspace_id: str
    snapshot_id: str
    reservation_id: str | None = None


class FolderPayload(BaseModel):
    action: Literal["choose", "open"]
    kind: Literal["save", "temp", "data"]


@router.post("/settings/folder")
def folder_action(payload: FolderPayload):
    from backend.services.folder_dialog import choose_folder, open_folder
    from backend.services.data_paths import get_data_dir
    options = get_file_settings()
    path = get_data_dir() if payload.kind == "data" else Path(options[f"{payload.kind}_dir"])
    try:
        if payload.action == "open":
            open_folder(path)
            return {"success": True}
        selected = choose_folder(path)
        return {"success": bool(selected), "cancelled": selected is None, "path": selected}
    except OSError as error:
        raise HTTPException(400, str(error))


@router.get("/settings/files")
def file_settings():
    return get_file_settings()


@router.patch("/settings/files")
def change_file_settings(payload: FileSettingsUpdate):
    try:
        return update_file_settings(payload.model_dump(exclude_none=True))
    except (OSError, ValueError) as error:
        raise HTTPException(400, str(error))


@router.get("/workspace/current")
def current_workspace():
    with workspace_lock:
        info = session_info()
        data = load_data_from_disk()
        saved = latest_snapshot(info["workspace_id"])
        applied_client_revision = None
        if saved:
            restore_resources(saved["resources"], board_folder(info["workspace_id"]))
            if not data["initialized"] or saved["database_revision"] >= data["revision"]:
                revision = data["revision"]
                if not data["initialized"] or any(data[key] != saved["state"][key] for key in ("cards", "groups")):
                    revision = force_replace_all(saved["state"])
                    acknowledge_revision(saved, revision)
                data = {**saved["state"], "revision": revision, "initialized": True}
                applied_client_revision = saved.get("client_revision")
        return {**data, **info, "initialized": data["initialized"] or info.get("initialized", False),
                "draft_client_revision": applied_client_revision,
                "success": data["initialized"] or info.get("initialized", False)}


@router.post("/workspace/draft")
def save_draft(payload: DraftPayload):
    with workspace_lock:
        info = session_info()
        if payload.workspace_id != info["workspace_id"]:
            raise HTTPException(409, "工作区已切换，请重新载入后暂存")
        options = get_file_settings()
        if not options["autosave_enabled"] and not payload.force:
            return {"success": False, "disabled": True}
        revision = get_revision()
        if payload.base_revision is not None and payload.base_revision != revision:
            raise HTTPException(409, "另一窗口已修改工作区，本地修改仍保留")
        state = payload.model_dump(include={"cards", "groups", "viewport", "pins"})
        try:
            if board_directory.get() is not None:
                revision = force_replace_all(state)
            saved = write_snapshot(info, state, revision, payload.client_revision)
            save_workspace_extras(payload.viewport, payload.pins)
            set_session({**info, "initialized": True})
            return {"success": True, "snapshot_id": saved["snapshot_id"], "saved_at": saved["saved_at"], "revision": revision}
        except (OSError, ValueError) as error:
            raise HTTPException(500, f"暂存失败：{error}")


@router.get("/workspace/recoveries")
def list_recoveries():
    with workspace_lock:
        return {"records": recovery_records()}


@router.post("/workspace/restore")
def restore_workspace(payload: RestorePayload):
    with workspace_lock:
        try:
            saved = read_snapshot(payload.workspace_id, payload.snapshot_id)
            restore_resources(saved["resources"], board_folder(payload.workspace_id))
            revision = force_replace_all(saved["state"])
            info = {"workspace_id": payload.workspace_id, "source_path": saved.get("source_path"), "initialized": True}
            set_session(info)
            from backend.services.data_paths import get_data_dir, update_config
            update_config({"drop_file_path": info["source_path"], "drop_storage_dir": str(get_data_dir().resolve())})
            write_snapshot(info, saved["state"], revision, 0)
            return {"success": True, **saved["state"], **info, "revision": revision}
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise HTTPException(400, f"恢复失败：{error}")
        finally:
            if payload.reservation_id:
                release_snapshot(payload.reservation_id)


@router.post("/workspace/reserve-recovery")
def reserve_recovery(payload: RestorePayload):
    with workspace_lock:
        try:
            return {"reservation_id": reserve_snapshot(payload.workspace_id, payload.snapshot_id)}
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise HTTPException(400, f"无法读取所选恢复版本：{error}")
