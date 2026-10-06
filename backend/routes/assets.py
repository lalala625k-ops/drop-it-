import os
import hashlib
import base64
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from backend.services.data_paths import get_assets_dir
from backend.services.thumbnail_service import get_or_create_thumbnail

router = APIRouter(prefix="/api", tags=["assets"])

class Base64AssetPayload(BaseModel):
    image: str

@router.post("/upload-asset")
async def upload_asset(payload: Base64AssetPayload):
    try:
        raw_data = payload.image
        ext = "jpg"
        if raw_data.startswith("data:"):
            header, encoded = raw_data.split(",", 1)
            if "png" in header:
                ext = "png"
            elif "webp" in header:
                ext = "webp"
            elif "gif" in header:
                ext = "gif"
        else:
            encoded = raw_data

        data_bytes = base64.b64decode(encoded)
        file_hash = hashlib.sha256(data_bytes).hexdigest()[:16]
        filename = f"{file_hash}.{ext}"
        # Resolve the directory per request, just like the static asset reader.
        # A cached ASSETS_DIR still points to the old folder after migration.
        assets_dir = get_assets_dir()
        assets_dir.mkdir(parents=True, exist_ok=True)
        filepath = assets_dir / filename

        if not os.path.exists(filepath):
            with open(filepath, "wb") as f:
                f.write(data_bytes)

        # Pre-generate thumbnail immediately
        thumbnail = get_or_create_thumbnail("assets", filename)

        return {
            "success": True,
            "url": f"/api/assets/{filename}",
            "thumbnail_url": f"/api/thumbnails/assets/{filename}" if thumbnail else None,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save asset: {str(e)}")

@router.get("/thumbnails/{category}/{filename}")
async def get_thumbnail_file(category: str, filename: str):
    if category not in ("assets", "screenshots"):
        raise HTTPException(status_code=400, detail="Invalid thumbnail category")
    
    thumb_path = get_or_create_thumbnail(category, filename)
    if not thumb_path or not thumb_path.is_file():
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    return FileResponse(
        path=str(thumb_path),
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=31536000, immutable"}
    )
