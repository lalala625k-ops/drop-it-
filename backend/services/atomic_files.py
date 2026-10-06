"""Durable writes and the lock shared by workspace/resource operations."""
import json
import os
import tempfile
import threading
from functools import wraps
from pathlib import Path

workspace_lock = threading.RLock()


def locked_workspace(function):
    @wraps(function)
    def invoke(*args, **kwargs):
        with workspace_lock:
            return function(*args, **kwargs)
    return invoke


def atomic_bytes(path: Path, contents: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def atomic_json(path: Path, value: dict) -> None:
    atomic_bytes(path, json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def writable_directory(path: Path) -> Path:
    path = path.expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryFile(dir=path):
        pass
    return path
