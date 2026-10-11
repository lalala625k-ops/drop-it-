import io
import os
import json
import io
import zipfile
import datetime
import tempfile
import threading
import shutil
from urllib.parse import unquote
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.services.data_paths import (
    get_data_dir, get_assets_dir, get_screenshots_dir, set_custom_data_dir,
    get_config, update_config,
)
from backend.services.drop_file_dialog import choose_drop_file, choose_existing_drop_file
from backend.services.template_paths import get_template_path
from backend.services.storage import load_data_from_disk, force_replace_all
from backend.services.atomic_files import locked_workspace
from backend.services.workspace_session import workspace_scope, session_info, set_session, opened_session
from backend.services.file_settings import get_file_settings
from backend.services.draft_store import write_snapshot

router = APIRouter(prefix="/api", tags=["settings_and_archive"], dependencies=[Depends(workspace_scope)])


class StoragePathUpdatePayload(BaseModel):
    new_path: str
    migrate_data: bool = True


class ArchiveExportPayload(BaseModel):
    viewport: Optional[Dict[str, Any]] = None
    pins: Optional[List[Dict[str, Any]]] = None
    cards: Optional[List[Dict[str, Any]]] = None
    groups: Optional[List[Dict[str, Any]]] = None


class DropSavePayload(ArchiveExportPayload):
    save_as: bool = False


_drop_save_lock = threading.Lock()


def _current_drop_path() -> Path:
    directory = get_data_dir().resolve()
    config = get_config()
    if (directory / "workspace.json").is_file():
        source = session_info(directory, config).get("source_path")
        return Path(source).resolve() if source else directory / "board.drop"
    if config.get("drop_storage_dir") == str(directory) and config.get("drop_file_path"):
        return Path(config["drop_file_path"]).resolve()
    return directory / "board.drop"


def _has_explicit_drop_path() -> bool:
    """Return whether the current workspace has a remembered user file."""
    directory = get_data_dir().resolve()
    config = get_config()
    if (directory / "workspace.json").is_file():
        return bool(session_info(directory, config).get("source_path"))
    path = config.get("drop_file_path")
    return (
        config.get("drop_storage_dir") == str(directory)
        and isinstance(path, str)
        and bool(path.strip())
    )


def _default_open_path() -> Path:
    remembered = get_config().get("drop_last_open_path")
    if remembered:
        return Path(remembered)
    has_opened = get_config().get("drop_open_storage_dir") == str(get_data_dir().resolve())
    if has_opened and _has_explicit_drop_path():
        return _current_drop_path()
    return get_template_path()


def _install_project_template() -> bool:
    """Install the bundled first-run board when the user has no workspace yet."""
    if _has_explicit_drop_path() or os.environ.get("PINBOARD_NEW_BOARD") == "1" or os.environ.get("PINBOARD_RELEASE_EMPTY") == "1":
        return False
    target = _current_drop_path()
    template = get_template_path()
    if target.exists() or not template.is_file():
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(template, target)
    target.with_suffix(target.suffix + ".template").touch()
    # .drop keeps media beside its metadata. Extract the bundled media once so
    # cards referring to /api/assets and /api/screenshots work immediately.
    try:
        with zipfile.ZipFile(template, mode="r") as archive:
            for name, folder in (("assets/", get_assets_dir()), ("screenshots/", get_screenshots_dir())):
                folder.mkdir(parents=True, exist_ok=True)
                for member in archive.namelist():
                    if not member.startswith(name) or member.endswith("/"):
                        continue
                    filename = Path(member).name
                    if filename:
                        destination = folder / filename
                        if not destination.exists():
                            with archive.open(member) as source, destination.open("wb") as output:
                                shutil.copyfileobj(source, output)
    except Exception:
        # The metadata file remains usable even if an individual asset fails.
        pass
    return True


def _workspace_cards_groups(payload: ArchiveExportPayload) -> tuple[list, list]:
    cards = payload.cards
    groups = payload.groups
    if cards is None or groups is None:
        disk_data = load_data_from_disk()
        cards = cards if cards is not None else disk_data.get("cards", [])
        groups = groups if groups is not None else disk_data.get("groups", [])
    return cards or [], groups or []


def _build_drop_bytes(payload: ArchiveExportPayload) -> bytes:
    cards, groups = _workspace_cards_groups(payload)
    meta = {
        "version": "1.0",
        "format": "drop",
        "savedAt": datetime.datetime.now().isoformat(),
        "viewport": payload.viewport or {"x": 0, "y": 0, "zoom": 1.0},
        "pins": payload.pins or [],
        "cards": cards,
        "groups": groups,
    }
    referenced_assets, referenced_screenshots = _referenced_resource_names(cards, groups)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("meta.json", json.dumps(meta, ensure_ascii=False, indent=2))
        for directory, prefix, names in (
            (get_assets_dir(), "assets", referenced_assets),
            (get_screenshots_dir(), "screenshots", referenced_screenshots),
        ):
            for name in sorted(names):
                item = directory / name
                if item.is_file():
                    try:
                        zf.write(item, arcname=f"{prefix}/{item.name}")
                    except Exception:
                        pass
    return zip_buffer.getvalue()


def _referenced_resource_names(cards: list, groups: list) -> tuple[set[str], set[str]]:
    """Return local asset/screenshot basenames referenced by the workspace.

    Saved workspaces used to include every file in the data directories. That
    kept deleted images inside later .drop files. Only paths served by this
    application are considered; remote website URLs are ignored.
    """
    assets: set[str] = set()
    screenshots: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for child in value.values():
                visit(child)
        elif isinstance(value, (list, tuple)):
            for child in value:
                visit(child)
        elif isinstance(value, str):
            for marker, target in (
                ("/api/assets/", assets),
                ("/api/thumbnails/assets/", assets),
                ("/api/screenshots/", screenshots),
                ("/api/thumbnails/screenshots/", screenshots),
            ):
                if not value.startswith(marker):
                    continue
                filename = unquote(value[len(marker):]).split("?", 1)[0].split("#", 1)[0]
                # A resource URL must identify one basename, never a path.
                if filename and "/" not in filename and "\\" not in filename:
                    target.add(filename)

    visit(cards)
    visit(groups)
    return assets, screenshots


def _prune_unreferenced_resources(cards: list, groups: list) -> None:
    """Remove local media no longer reachable from the current workspace."""
    referenced_assets, referenced_screenshots = _referenced_resource_names(cards, groups)
    for directory, names in (
        (get_assets_dir(), referenced_assets),
        (get_screenshots_dir(), referenced_screenshots),
    ):
        if not directory.is_dir():
            continue
        for item in directory.iterdir():
            if item.is_file() and item.name not in names:
                try:
                    item.unlink()
                except OSError:
                    # A thumbnailer or another request may still have a file open.
                    pass


def _read_drop_meta(path: Path) -> Dict[str, Any]:
    if path.suffix.lower() != ".drop":
        raise ValueError("请选择 .drop 工作区文件")
    with zipfile.ZipFile(path, mode="r") as archive:
        if "meta.json" not in archive.namelist():
            raise ValueError("便签包损坏或缺少 meta.json")
        return json.loads(archive.read("meta.json").decode("utf-8"))


def _extract_drop_assets(path: Path) -> None:
    with zipfile.ZipFile(path, mode="r") as archive:
        for name, folder in (("assets/", get_assets_dir()), ("screenshots/", get_screenshots_dir())):
            folder.mkdir(parents=True, exist_ok=True)
            for member in archive.namelist():
                if not member.startswith(name) or member.endswith("/"):
                    continue
                filename = Path(member).name
                if not filename:
                    continue
                target = folder / filename
                with archive.open(member) as source, target.open("wb") as output:
                    shutil.copyfileobj(source, output)


@router.get("/settings/storage-path")
async def get_storage_path():
    current = get_data_dir()
    default_base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    default_path = (default_base / "InfiniteCanvasNote" / "data").resolve()
    return {
        "current_path": str(current),
        "default_path": str(default_path),
        "is_default": current == default_path,
    }


@router.post("/settings/storage-path")
@locked_workspace
def update_storage_path(payload: StoragePathUpdatePayload):
    new_path_str = payload.new_path.strip()
    if not new_path_str:
        raise HTTPException(status_code=400, detail="保存路径不能为空")
    try:
        result = set_custom_data_dir(new_path_str, payload.migrate_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更改存储目录失败: {str(e)}")


@router.post("/archive/export")
async def export_archive(payload: ArchiveExportPayload):
    # Retrieve cards and groups
    cards = payload.cards
    groups = payload.groups
    if cards is None or groups is None:
        disk_data = load_data_from_disk()
        if cards is None:
            cards = disk_data.get("cards", [])
        if groups is None:
            groups = disk_data.get("groups", [])

    now_str = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    meta = {
        "version": "1.0",
        "exportedAt": datetime.datetime.now().isoformat(),
        "viewport": payload.viewport or {"x": 0, "y": 0, "zoom": 1.0},
        "pins": payload.pins or [],
        "cards": cards,
        "groups": groups,
    }

    # Collect referenced assets
    assets_dir = get_assets_dir()
    screenshots_dir = get_screenshots_dir()

    zip_buffer = io.BytesIO()
    referenced_assets, referenced_screenshots = _referenced_resource_names(cards, groups)
    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # Write metadata
        zf.writestr("meta.json", json.dumps(meta, ensure_ascii=False, indent=2))

        for directory, prefix, names in (
            (assets_dir, "assets", referenced_assets),
            (screenshots_dir, "screenshots", referenced_screenshots),
        ):
            for name in sorted(names):
                item = directory / name
                if item.is_file():
                    try:
                        zf.write(item, arcname=f"{prefix}/{item.name}")
                    except Exception:
                        pass

    zip_buffer.seek(0)
    filename = f"canvas_archive_{now_str}.note"
    return StreamingResponse(
        zip_buffer,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/storage/save")
@locked_workspace
def save_drop_file(payload: DropSavePayload):
    """Run dialog and archive writing off the API event loop."""
    if not _drop_save_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="正在保存，请稍候")
    temporary_path = None
    try:
        has_explicit_path = _has_explicit_drop_path()
        target = _current_drop_path()
        # A workspace without an explicit file has never been saved by the
        # user. Prompt on its first Ctrl+S, just like an ordinary editor.
        choose_path = payload.save_as or not has_explicit_path
        if choose_path:
            target = choose_drop_file(Path(get_file_settings()["save_dir"]) / target.name)
            if target is None:
                return {"success": False, "cancelled": True}
        target.parent.mkdir(parents=True, exist_ok=True)
        cards, groups = _workspace_cards_groups(payload)
        contents = _build_drop_bytes(payload)
        # A failed write must leave the previous .drop file intact.
        with tempfile.NamedTemporaryFile(dir=target.parent, suffix=".drop.tmp", delete=False) as stream:
            temporary_path = Path(stream.name)
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_path, target)
        temporary_path = None
        _prune_unreferenced_resources(cards, groups)
        target.with_suffix(target.suffix + ".template").unlink(missing_ok=True)
        if choose_path:
            update_config({"drop_file_path": str(target), "drop_storage_dir": str(get_data_dir().resolve())})
        info = session_info(get_data_dir(), get_config())
        set_session({**info, "source_path": str(target), "initialized": True}, get_data_dir())
        return {"success": True, "path": str(target), "filename": target.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存 .drop 文件失败: {str(e)}")
    finally:
        try:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
        finally:
            _drop_save_lock.release()


@router.post("/storage/open")
@locked_workspace
def open_drop_file():
    """Choose a .drop workspace, replace the current database, and return it."""
    try:
        target = choose_existing_drop_file(_default_open_path())
        if target is None:
            return {"success": False, "cancelled": True}
        meta = _read_drop_meta(target)
        cards = meta.get("cards", [])
        groups = meta.get("groups", [])
        if not isinstance(cards, list) or not isinstance(groups, list):
            raise ValueError("便签包中的卡片或分组数据无效")
        _extract_drop_assets(target)
        state = {"cards": cards, "groups": groups, "viewport": meta.get("viewport"), "pins": meta.get("pins", [])}
        info = opened_session(None if target.resolve() == get_template_path().resolve() else target, get_data_dir())
        # Protect the incoming board's media before adopting its identity.
        from backend.services.storage import get_revision
        write_snapshot(info, state, get_revision() + 1, 0)
        revision = force_replace_all(state)
        set_session(info, get_data_dir())
        changes = {"drop_open_storage_dir": str(get_data_dir().resolve()), "drop_last_open_path": str(target)}
        if target.resolve() == get_template_path().resolve():
            # Opening the example starts an unsaved workspace. Its first save
            # must choose a user file rather than replace the shipped example.
            changes.update(drop_file_path=None, drop_storage_dir=None)
        else:
            changes.update(drop_file_path=str(target), drop_storage_dir=str(get_data_dir().resolve()))
        update_config(changes)
        target.with_suffix(target.suffix + ".template").unlink(missing_ok=True)
        return {
            "success": True,
            "path": str(target),
            "filename": target.name,
            "cards": cards,
            "groups": groups,
            "viewport": meta.get("viewport"),
            "pins": meta.get("pins", []),
            "revision": revision,
            "workspace_id": info["workspace_id"],
        }
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"打开 .drop 文件失败: {error}")


@router.get("/storage/load")
async def load_drop_file():
    """Read the stored .drop file when the database has no workspace data."""
    target = _current_drop_path()
    installed_template = _install_project_template()
    is_template = installed_template or target.with_suffix(target.suffix + ".template").is_file()
    if not target.is_file():
        return {"success": False, "cards": [], "groups": []}
    try:
        with zipfile.ZipFile(target, mode="r") as zf:
            meta = json.loads(zf.read("meta.json").decode("utf-8"))
        return {"success": True, "is_template": is_template, **meta}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取 .drop 文件失败: {str(e)}")


@router.post("/archive/import")
async def import_archive(file: UploadFile = File(...)):
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="上传文件为空")

    try:
        zip_buffer = io.BytesIO(contents)
        with zipfile.ZipFile(zip_buffer, mode="r") as zf:
            namelist = zf.namelist()
            if "meta.json" not in namelist:
                raise HTTPException(status_code=400, detail="便签包损坏或缺少 meta.json")

            meta_raw = zf.read("meta.json").decode("utf-8")
            meta = json.loads(meta_raw)

            cards = meta.get("cards", [])
            groups = meta.get("groups", [])
            viewport = meta.get("viewport")
            pins = meta.get("pins", [])

            # Extract assets
            target_assets = get_assets_dir()
            target_screenshots = get_screenshots_dir()
            target_assets.mkdir(parents=True, exist_ok=True)
            target_screenshots.mkdir(parents=True, exist_ok=True)

            for name in namelist:
                if name.startswith("assets/") and len(name) > len("assets/"):
                    fname = os.path.basename(name)
                    if fname:
                        target_file = target_assets / fname
                        with zf.open(name) as src, open(target_file, "wb") as dst:
                            dst.write(src.read())

                elif name.startswith("screenshots/") and len(name) > len("screenshots/"):
                    fname = os.path.basename(name)
                    if fname:
                        target_file = target_screenshots / fname
                        with zf.open(name) as src, open(target_file, "wb") as dst:
                            dst.write(src.read())

            # Replace in database
            revision = force_replace_all({"cards": cards, "groups": groups})

            return {
                "success": True,
                "cards": cards,
                "groups": groups,
                "viewport": viewport,
                "pins": pins,
                "revision": revision,
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入便签包失败: {str(e)}")
