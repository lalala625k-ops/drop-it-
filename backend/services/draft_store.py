"""Versioned JSON workspaces with content-addressed resource copies."""
import datetime
import hashlib
import json
import re
import time
import uuid
from pathlib import Path
from backend.services.atomic_files import atomic_json, workspace_lock
from backend.services.file_settings import get_file_settings
from backend.services.draft_resources import capture_resources, verify_resources

_reservations: dict[str, tuple[str, str, float]] = {}


def reserve_snapshot(workspace_id: str, snapshot_id: str) -> str:
    read_snapshot(workspace_id, snapshot_id)
    token = uuid.uuid4().hex
    _reservations[token] = (workspace_id, snapshot_id, time.monotonic() + 120)
    return token


def release_snapshot(token: str) -> None:
    reserved = _reservations.pop(token, None)
    if reserved:
        _prune(reserved[0], get_file_settings()["retention_count"])


def acknowledge_revision(saved: dict, revision: int) -> None:
    saved["database_revision"] = revision
    atomic_json(board_folder(saved["workspace_id"]) / "snapshots" / f"{saved['snapshot_id']}.json", saved)


def board_folder(workspace_id: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{32}", workspace_id):
        raise ValueError("画板标识无效")
    return Path(get_file_settings()["temp_dir"]) / workspace_id


def read_snapshot(workspace_id: str, snapshot_id: str, verify=True) -> dict:
    if not re.fullmatch(r"[0-9]{16,24}-[0-9a-f]{12}", snapshot_id):
        raise ValueError("恢复版本标识无效")
    directory = board_folder(workspace_id)
    data = json.loads((directory / "snapshots" / f"{snapshot_id}.json").read_text(encoding="utf-8"))
    if data.get("format") != "drop-draft-v1" or data.get("workspace_id") != workspace_id:
        raise ValueError("恢复记录格式或画板身份无效")
    state = data.get("state", {})
    if not all(isinstance(state.get(key), list) for key in ("cards", "groups", "pins")):
        raise ValueError("恢复记录缺少完整工作区")
    if verify:
        verify_resources(data.get("resources", {}), directory)
    return data


def snapshot_files(workspace_id: str) -> list[Path]:
    return sorted((board_folder(workspace_id) / "snapshots").glob("*.json"), reverse=True)


def latest_snapshot(workspace_id: str) -> dict | None:
    for path in snapshot_files(workspace_id):
        try:
            return read_snapshot(workspace_id, path.stem)
        except (OSError, ValueError, KeyError, TypeError):
            continue
    return None


def write_snapshot(info: dict, state: dict, database_revision: int, client_revision: int) -> dict:
    with workspace_lock:
        directory = board_folder(info["workspace_id"])
        fingerprint = hashlib.sha256(json.dumps(state, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        previous = latest_snapshot(info["workspace_id"])
        if previous and previous.get("fingerprint") == fingerprint and previous.get("source_path") == info.get("source_path"):
            previous.update(database_revision=database_revision, client_revision=client_revision)
            atomic_json(directory / "snapshots" / f"{previous['snapshot_id']}.json", previous)
            return previous
        protected, resources = capture_resources(state, directory)
        snapshot_id = f"{time.time_ns()}-{uuid.uuid4().hex[:12]}"
        data = {"format": "drop-draft-v1", "workspace_id": info["workspace_id"], "snapshot_id": snapshot_id,
                "source_path": info.get("source_path"), "saved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "database_revision": database_revision, "client_revision": client_revision,
                "fingerprint": fingerprint, "state": protected, "resources": resources}
        atomic_json(directory / "snapshots" / f"{snapshot_id}.json", data)
        _prune(info["workspace_id"], get_file_settings()["retention_count"])
        return data


def _prune(workspace_id: str, count: int) -> None:
    files = snapshot_files(workspace_id)
    retained = []
    corrupt = False
    protected = {snapshot for board, snapshot, expiry in _reservations.values()
                 if board == workspace_id and expiry > time.monotonic()}
    for path in files:
        try:
            data = read_snapshot(workspace_id, path.stem)
        except (OSError, ValueError, TypeError):
            corrupt = True
            continue
        if len(retained) < count or path.stem in protected:
            retained.append(data)
        else:
            path.unlink(missing_ok=True)
    if corrupt:
        return  # Do not discard resources that a damaged manifest may reference.
    referenced = {digest for data in retained for digest in data["resources"].values()}
    for blob in (board_folder(workspace_id) / "resources").glob("*"):
        if blob.is_file() and blob.name not in referenced:
            blob.unlink(missing_ok=True)


def recovery_records() -> list[dict]:
    records = []
    root = Path(get_file_settings()["temp_dir"])
    for directory in root.iterdir():
        if not directory.is_dir() or not re.fullmatch(r"[0-9a-f]{32}", directory.name):
            continue
        for path in snapshot_files(directory.name):
            try:
                data = read_snapshot(directory.name, path.stem, verify=False)
                source = data.get("source_path")
                records.append({key: data[key] for key in ("workspace_id", "snapshot_id", "saved_at")})
                records[-1].update(name=Path(source).name if source else f"未命名画板 {directory.name[:6]}",
                                   source_path=source, card_count=len(data["state"]["cards"]))
            except (OSError, ValueError, KeyError, TypeError):
                continue
    return sorted(records, key=lambda record: record["snapshot_id"], reverse=True)
