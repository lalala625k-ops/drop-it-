import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
legacy_override = os.environ.get("PINBOARD_LEGACY_DATA_DIR")
LEGACY_DATA_DIR = Path(legacy_override) if legacy_override else PROJECT_ROOT / "backend" / "data"
if not legacy_override and not LEGACY_DATA_DIR.exists():
    desktop_copy = Path.home() / "Desktop" / "note" / "backend" / "data"
    if desktop_copy.exists():
        LEGACY_DATA_DIR = desktop_copy


def data_dir() -> Path:
    override = os.environ.get("PINBOARD_DATA_DIR")
    if override:
        return Path(override).resolve()
    if os.name == "nt" or os.environ.get("PINBOARD_DESKTOP") == "1":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return base / "InfiniteCanvasNote" / "data"
    return LEGACY_DATA_DIR


DATA_DIR = data_dir()
ASSETS_DIR = DATA_DIR / "assets"
SCREENSHOTS_DIR = DATA_DIR / "screenshots"
