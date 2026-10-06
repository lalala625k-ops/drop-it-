"""Immutable recovery media, independent of live resource pruning."""
import base64
import hashlib
import re
from pathlib import Path
from urllib.parse import unquote
from backend.services.atomic_files import atomic_bytes
from backend.services.data_paths import get_assets_dir, get_screenshots_dir


def resource_target(url: str) -> Path | None:
    for prefix, folder in (("/api/assets/", get_assets_dir), ("/api/screenshots/", get_screenshots_dir),
                           ("/api/thumbnails/assets/", get_assets_dir),
                           ("/api/thumbnails/screenshots/", get_screenshots_dir)):
        if url.startswith(prefix):
            name = unquote(url[len(prefix):].split("?", 1)[0].split("#", 1)[0])
            if name and name not in (".", "..") and not any(c in name for c in "/\\:"):
                target = folder() / name
                if target.resolve().parent == folder().resolve():
                    return target
    return None


def capture_resources(state: dict, directory: Path) -> tuple[dict, dict]:
    resources = {}
    cache = {}
    def visit(value):
        if isinstance(value, dict):
            return {key: visit(child) for key, child in value.items()}
        if isinstance(value, list):
            return [visit(child) for child in value]
        if not isinstance(value, str):
            return value
        if value in cache:
            return cache[value]
        target = resource_target(value)
        if target is not None:
            if not target.is_file():
                raise FileNotFoundError(f"暂存图片缺失：{target.name}")
            contents = target.read_bytes()
            output = value
        elif value.startswith("data:image/") and ";base64," in value:
            header, encoded = value.split(",", 1)
            contents = base64.b64decode(encoded, validate=True)
            extension = header.split("/", 1)[1].split(";", 1)[0]
            extension = extension if re.fullmatch(r"[a-zA-Z0-9+.-]{1,24}", extension) else "png"
            output = f"/api/assets/draft-{hashlib.sha256(contents).hexdigest()}.{extension}"
        else:
            return value
        digest = hashlib.sha256(contents).hexdigest()
        blob = directory / "resources" / digest
        if not blob.is_file():
            atomic_bytes(blob, contents)
        resources[output] = digest
        cache[value] = output
        return output
    return visit(state), resources


def verify_resources(resources: dict, directory: Path) -> None:
    for url, digest in resources.items():
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest) or resource_target(url) is None:
            raise ValueError("恢复记录的图片索引无效")
        blob = directory / "resources" / digest
        with blob.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != digest:
                raise ValueError("恢复图片校验失败")


def restore_resources(resources: dict, directory: Path) -> None:
    verify_resources(resources, directory)
    for url, digest in resources.items():
        target = resource_target(url)
        atomic_bytes(target, (directory / "resources" / digest).read_bytes())
