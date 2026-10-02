import os
import hashlib
import base64
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.data_paths import ASSETS_DIR

router = APIRouter(prefix="/api", tags=["assets"])

os.makedirs(ASSETS_DIR, exist_ok=True)

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
        filepath = os.path.join(ASSETS_DIR, filename)

        if not os.path.exists(filepath):
            with open(filepath, "wb") as f:
                f.write(data_bytes)

        return {"success": True, "url": f"/api/assets/{filename}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save asset: {str(e)}")
