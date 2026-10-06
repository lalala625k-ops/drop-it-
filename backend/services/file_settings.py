"""File destinations are separate from the live SQLite/resource directory."""
import hashlib
import logging
import os
import sys
from pathlib import Path
from backend.services.atomic_files import workspace_lock, writable_directory
from backend.services.data_paths import PROJECT_ROOT, get_config, update_config

RECOVERY_DEFAULTS = {"autosave_enabled": True, "idle_seconds": 5, "max_seconds": 30, "retention_count": 5}


def application_directory() -> Path:
    return Path(os.environ.get("PINBOARD_APP_ROOT") or
                (Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else PROJECT_ROOT)).resolve()


def fallback_files_directory() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    return base / "InfiniteCanvasNote" / "Files"


def default_file_directories() -> dict:
    for root in (application_directory() / "Files", fallback_files_directory()):
        try:
            folders = {name: writable_directory(root / name) for name in ("Template", "Save", "Temporary")}
            return {"save_dir": str(folders["Save"]), "temp_dir": str(folders["Temporary"])}
        except OSError:
            if root == fallback_files_directory():
                raise
    raise OSError("无法创建文件目录")


def _upgrade_default_directories(config: dict, current: dict, defaults: dict) -> tuple[dict, str | None]:
    previous = config.get("file_directory_defaults") or {}
    legacy_roots = (application_directory() / "Files", fallback_files_directory())
    updated = dict(current)
    for key, suffix in (("save_dir", ""), ("temp_dir", "Temp")):
        candidates = [root / suffix for root in legacy_roots]
        if previous.get(key):
            candidates.append(Path(previous[key]))
        if current.get(key) and Path(current[key]).resolve() in [path.resolve() for path in candidates]:
            updated[key] = defaults[key]
    if updated.get("temp_dir") != current.get("temp_dir"):
        try:
            _copy_recoveries(Path(current["temp_dir"]), Path(updated["temp_dir"]))
        except (OSError, ValueError) as error:
            logging.getLogger(__name__).warning("默认暂存目录迁移失败，继续使用原地址：%s", error)
            return current, "默认暂存目录迁移失败，已保留原地址和恢复记录。"
    return updated, None


def get_file_settings() -> dict:
    with workspace_lock:
        config = get_config()
        configured = config.get("file_settings", {})
        defaults = {**default_file_directories(), **RECOVERY_DEFAULTS}
        configured, migration_error = _upgrade_default_directories(config, configured, defaults)
        result = {**defaults, **configured}
        directory_defaults = {key: defaults[key] for key in ("save_dir", "temp_dir")}
        if not migration_error and (config.get("file_settings") != result or config.get("file_directory_defaults") != directory_defaults):
            update_config({"file_settings": result, "file_directory_defaults": directory_defaults})
        return {**result, "defaults": defaults, **({"migration_error": migration_error} if migration_error else {})}


def _copy_recoveries(source: Path, target: Path) -> None:
    if source == target or not source.exists():
        return
    if source in target.parents or target in source.parents:
        raise ValueError("暂存地址不能与原暂存地址互相嵌套")
    for board in source.iterdir():
        if not board.is_dir() or len(board.name) != 32 or any(c not in "0123456789abcdef" for c in board.name):
            continue
        for item in board.rglob("*"):
            if not item.is_file() or item.is_symlink():
                continue
            destination = target / item.relative_to(source)
            destination.parent.mkdir(parents=True, exist_ok=True)
            digest = _digest(item)
            if destination.exists():
                if _digest(destination) != digest:
                    raise ValueError("目标暂存地址存在不同内容的同名文件")
            else:
                from backend.services.atomic_files import atomic_bytes
                atomic_bytes(destination, item.read_bytes())
            if _digest(destination) != digest:
                raise OSError("暂存记录复制校验失败")


def _digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def update_file_settings(changes: dict) -> dict:
    with workspace_lock:
        current = get_file_settings()
        current.pop("defaults")
        current.pop("migration_error", None)
        updated = {**current, **changes}
        for key in ("save_dir", "temp_dir"):
            raw = str(updated[key]).strip()
            if not raw or not Path(raw).expanduser().is_absolute():
                raise ValueError("请使用文件夹的绝对路径")
            updated[key] = str(writable_directory(Path(raw)))
        if not 1 <= updated["idle_seconds"] <= 30 or not 1 <= updated["retention_count"] <= 20:
            raise ValueError("暂存频率为 1–30 秒，保留版本为 1–20 版")
        _copy_recoveries(Path(current["temp_dir"]), Path(updated["temp_dir"]))
        update_config({"file_settings": updated})
        return get_file_settings()
