import json
import os
import shutil
import threading
from contextlib import contextmanager
from pathlib import Path
from backend.services.atomic_files import atomic_json


PROJECT_ROOT = Path(__file__).resolve().parents[2]
legacy_override = os.environ.get("PINBOARD_LEGACY_DATA_DIR")
LEGACY_DATA_DIR = Path(legacy_override) if legacy_override else PROJECT_ROOT / "backend" / "data"
if not legacy_override and not LEGACY_DATA_DIR.exists():
    desktop_copy = Path.home() / "Desktop" / "note" / "backend" / "data"
    if desktop_copy.exists():
        LEGACY_DATA_DIR = desktop_copy

CONFIG_DIR = Path(
    os.environ.get(
        "PINBOARD_CONFIG_DIR",
        Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        / "InfiniteCanvasNote",
    )
).expanduser().resolve()
CONFIG_FILE = CONFIG_DIR / "config.json"
_config_lock = threading.RLock()


@contextmanager
def config_write_lock():
    """Serialize config updates across independently launched desktop boards."""
    with _config_lock:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with (CONFIG_DIR / "config.lock").open("a+b") as stream:
            stream.seek(0)
            if not stream.read(1):
                stream.write(b"0")
                stream.flush()
            stream.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                stream.seek(0)
                if os.name == "nt":
                    msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def get_config() -> dict:
    if not CONFIG_FILE.is_file():
        return {}
    try:
        with CONFIG_FILE.open(encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(cfg: dict) -> None:
    with config_write_lock():
        atomic_json(CONFIG_FILE, cfg)


def update_config(changes: dict) -> None:
    with config_write_lock():
        atomic_json(CONFIG_FILE, {**get_config(), **changes})


def get_data_dir() -> Path:
    from backend.services.workspace_session import board_directory
    scoped = board_directory.get()
    if scoped is not None:
        return scoped.resolve()
    override = os.environ.get("PINBOARD_DATA_DIR")
    if override:
        return Path(override).resolve()
    cfg = get_config()
    custom_dir = cfg.get("data_dir")
    if custom_dir:
        p = Path(custom_dir).resolve()
        if p.exists() or p.parent.exists():
            return p
    if os.name == "nt" or os.environ.get("PINBOARD_DESKTOP") == "1":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return (base / "InfiniteCanvasNote" / "data").resolve()
    return LEGACY_DATA_DIR.resolve()


def get_assets_dir() -> Path:
    return get_data_dir() / "assets"


def get_screenshots_dir() -> Path:
    return get_data_dir() / "screenshots"


def get_thumbnails_dir() -> Path:
    return get_data_dir() / "thumbnails"


def get_db_file() -> Path:
    return get_data_dir() / "board.sqlite3"


DATA_DIR = get_data_dir()
ASSETS_DIR = get_assets_dir()
SCREENSHOTS_DIR = get_screenshots_dir()
THUMBNAILS_DIR = get_thumbnails_dir()


def set_custom_data_dir(new_path_str: str, migrate_data: bool = True) -> dict:
    old_data_dir = get_data_dir()
    new_data_dir = Path(new_path_str).resolve()
    new_data_dir.mkdir(parents=True, exist_ok=True)
    new_assets = new_data_dir / "assets"
    new_screenshots = new_data_dir / "screenshots"
    new_thumbnails = new_data_dir / "thumbnails"
    new_assets.mkdir(exist_ok=True)
    new_screenshots.mkdir(exist_ok=True)
    new_thumbnails.mkdir(exist_ok=True)

    migrated_files = 0
    if migrate_data and old_data_dir != new_data_dir and old_data_dir.exists():
        from backend.services.storage import backup_database
        backup_database(new_data_dir / "board.sqlite3")
        migrated_files += 1
        for db_file_name in ("board.drop", "workspace.json"):
            src_f = old_data_dir / db_file_name
            if src_f.exists():
                shutil.copy2(src_f, new_data_dir / db_file_name)
                migrated_files += 1

        for folder_name, target_folder in (("assets", new_assets), ("screenshots", new_screenshots), ("thumbnails", new_thumbnails)):
            old_folder = old_data_dir / folder_name
            if old_folder.is_dir():
                for item in old_folder.iterdir():
                    if item.is_file():
                        target_file = target_folder / item.name
                        if not target_file.exists():
                            shutil.copy2(item, target_file)
                            migrated_files += 1

    cfg = get_config()
    from backend.services.workspace_session import board_directory, board_key
    if board_key.get():
        changes = {"browser_data_dirs": {**cfg.get("browser_data_dirs", {}), board_key.get(): str(new_data_dir)}}
        board_directory.set(new_data_dir)
    elif os.environ.get("PINBOARD_DATA_DIR"):
        os.environ["PINBOARD_DATA_DIR"] = str(new_data_dir)
        changes = {}
    else:
        changes = {"data_dir": str(new_data_dir)}
    for key in ("drop_storage_dir", "drop_open_storage_dir"):
        if cfg.get(key) == str(old_data_dir.resolve()):
            changes[key] = str(new_data_dir)
    update_config(changes)

    # Update module-level cache
    global DATA_DIR, ASSETS_DIR, SCREENSHOTS_DIR, THUMBNAILS_DIR
    DATA_DIR = new_data_dir
    ASSETS_DIR = new_assets
    SCREENSHOTS_DIR = new_screenshots
    THUMBNAILS_DIR = new_thumbnails

    return {
        "success": True,
        "data_dir": str(new_data_dir),
        "migrated_files": migrated_files,
    }
