"""Recover images left behind by the old upload directory cache."""

import os
import re
import shutil
import tempfile
from pathlib import Path

from backend.services.data_paths import CONFIG_DIR


def recover_legacy_upload(filename: str, assets_dir: Path) -> None:
    # Only application-generated image filenames can be recovered. Never scan
    # or import another workspace's card data, and keep empty releases empty.
    if os.environ.get("PINBOARD_RELEASE_EMPTY") == "1":
        return
    if not re.fullmatch(r"[a-f0-9]{16}\.(?:png|jpg|jpeg|gif|webp|bmp|avif|svg)", filename):
        return
    target = assets_dir / filename
    if target.is_file():
        return
    old_assets = (CONFIG_DIR / "data" / "assets").resolve()
    if old_assets == assets_dir.resolve():
        return
    source = old_assets / filename
    if not source.is_file() or source.resolve().parent != old_assets:
        return

    temporary = None
    try:
        assets_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=assets_dir, prefix=".recover-", delete=False) as output:
            temporary = Path(output.name)
            with source.open("rb") as original:
                shutil.copyfileobj(original, output)
        if not target.exists():
            os.replace(temporary, target)
    except OSError:
        # A read-only destination must not stop unrelated image requests.
        pass
    finally:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
