"""Locate the single example workspace relative to the application directory."""

from pathlib import Path
from backend.services.file_settings import application_directory, default_file_directories
from backend.services.atomic_files import atomic_bytes
from backend.services.data_paths import PROJECT_ROOT
import sys


TEMPLATE_FILENAME = "Template一.drop"


def get_template_path() -> Path:
    files = Path(default_file_directories()["save_dir"]).parent
    target = files / "Template" / TEMPLATE_FILENAME
    if not target.is_file():
        folders = [application_directory() / "Files" / "Template", application_directory() / "Template"]
        if not getattr(sys, "frozen", False):
            folders.append(PROJECT_ROOT / "desktop" / "Template")
        source = next((folder / TEMPLATE_FILENAME for folder in folders if (folder / TEMPLATE_FILENAME).is_file()), None)
        if source:
            atomic_bytes(target, source.read_bytes())
    return target
