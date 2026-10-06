"""Stable workspace identity, including isolated browser boards."""
import json
import re
import uuid
from contextvars import ContextVar
from pathlib import Path
from fastapi import HTTPException
from backend.services.atomic_files import atomic_json

board_directory: ContextVar[Path | None] = ContextVar("board_directory", default=None)
board_key: ContextVar[str | None] = ContextVar("board_key", default=None)


async def workspace_scope(board_id: str | None = None):
    token = None
    key_token = None
    if board_id:
        if not re.fullmatch(r"[a-zA-Z0-9-]{1,64}", board_id):
            raise HTTPException(400, "画板标识无效")
        from backend.services.data_paths import CONFIG_DIR, get_config
        custom = get_config().get("browser_data_dirs", {}).get(board_id)
        token = board_directory.set(Path(custom) if custom else CONFIG_DIR / "boards" / "browser" / board_id)
        key_token = board_key.set(board_id)
    try:
        yield
    finally:
        if token is not None:
            board_directory.reset(token)
            board_key.reset(key_token)


def session_info(directory: Path | None = None, config: dict | None = None) -> dict:
    from backend.services.data_paths import get_data_dir, get_config
    directory = (directory or get_data_dir()).resolve()
    path = directory / "workspace.json"
    if path.is_file():
        try:
            info = json.loads(path.read_text(encoding="utf-8"))
            if re.fullmatch(r"[0-9a-f]{32}", info["workspace_id"]):
                return info
        except (ValueError, KeyError, TypeError):
            pass
    cfg = config if config is not None else get_config()
    source = cfg.get("drop_file_path") if cfg.get("drop_storage_dir") == str(directory) else None
    return {"workspace_id": uuid.uuid5(uuid.NAMESPACE_URL, str(directory)).hex,
            "source_path": source, "initialized": False}


def set_session(info: dict, directory: Path | None = None) -> None:
    from backend.services.data_paths import get_data_dir
    atomic_json((directory or get_data_dir()) / "workspace.json", info)


def opened_session(source: Path | None, directory: Path | None = None) -> dict:
    from backend.services.data_paths import get_data_dir
    directory = (directory or get_data_dir()).resolve()
    previous = session_info(directory)
    if source and previous.get("source_path") == str(source.resolve()):
        return {**previous, "initialized": True}
    identity = f"{directory}:{source.resolve() if source else uuid.uuid4()}"
    info = {"workspace_id": uuid.uuid5(uuid.NAMESPACE_URL, identity).hex,
            "source_path": str(source.resolve()) if source else None, "initialized": True}
    return info
