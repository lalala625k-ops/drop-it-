import io
import os
import threading
from pathlib import Path
from typing import Optional, Union
from PIL import Image, ImageOps

from backend.services.data_paths import (
    get_assets_dir, get_screenshots_dir, get_thumbnails_dir
)


def generate_thumbnail(src: Union[Path, bytes], dst_path: Path, max_dim: int = 800) -> bool:
    """
    Generates an 800px max dimension WebP thumbnail atomically.
    Preserves alpha channel if present.
    """
    try:
        if isinstance(src, bytes):
            image_stream = io.BytesIO(src)
        else:
            if not src.is_file():
                return False
            image_stream = open(src, "rb")

        with image_stream:
            with Image.open(image_stream) as img:
                img = ImageOps.exif_transpose(img)
                if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                    img = img.convert("RGBA")
                elif img.mode != "RGB":
                    img = img.convert("RGB")

                # If image is already smaller than max_dim in both dimensions,
                # we still convert to WebP for uniform compression and fast decoding
                img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

                dst_path.parent.mkdir(parents=True, exist_ok=True)
                temp_dst = dst_path.with_name(f"{dst_path.name}.tmp.{os.getpid()}")
                img.save(temp_dst, format="WEBP", quality=80, method=4)
                os.replace(temp_dst, dst_path)
                return True
    except Exception as e:
        print(f"[ThumbnailService] Error generating thumbnail for {src}: {e}")
        return False


def get_or_create_thumbnail(category: str, filename: str) -> Optional[Path]:
    """
    Retrieves the cached WebP thumbnail for an asset or screenshot.
    Generates it on-demand if it does not yet exist.
    """
    thumb_name = f"{category}_{filename}.webp"
    thumb_path = get_thumbnails_dir() / thumb_name
    if thumb_path.is_file() and thumb_path.stat().st_size > 0:
        return thumb_path

    src_dir = get_assets_dir() if category == "assets" else get_screenshots_dir()
    src_file = src_dir / filename
    if not src_file.is_file():
        return None

    success = generate_thumbnail(src_file, thumb_path)
    if success and thumb_path.is_file():
        return thumb_path
    return None


def run_batch_pregeneration():
    """Pregenerates missing thumbnails for existing media in background."""
    def _worker():
        try:
            thumbnails_dir = get_thumbnails_dir()
            thumbnails_dir.mkdir(parents=True, exist_ok=True)
            for category, src_dir in [("assets", get_assets_dir()), ("screenshots", get_screenshots_dir())]:
                if not src_dir.is_dir():
                    continue
                for f in src_dir.iterdir():
                    if f.is_file() and not f.name.endswith(".tmp"):
                        thumb_name = f"{category}_{f.name}.webp"
                        target = thumbnails_dir / thumb_name
                        if not target.is_file() or target.stat().st_size == 0:
                            generate_thumbnail(f, target)
        except Exception as e:
            print(f"[ThumbnailService] Batch generation error: {e}")

    thread = threading.Thread(target=_worker, daemon=True, name="ThumbnailWorker")
    thread.start()
