import json
import base64
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Request
from backend.services.ocr_service import extract_text_from_image
from backend.services.scraper_service import scrape_url_metadata
from backend.services.screenshot_link_service import recover_screenshot_link

router = APIRouter(prefix="/api", tags=["parser"])

@router.post("/recognize-image")
async def recognize_image(request: Request, file: Optional[UploadFile] = File(None)):
    image_bytes = await _read_image_bytes(request, file)
    return extract_text_from_image(image_bytes)


async def _read_image_bytes(request: Request, file: Optional[UploadFile] = None) -> bytes:
    image_bytes = None
    if file:
        image_bytes = await file.read()
    else:
        try:
            body = await request.body()
            if body:
                if body.startswith(b"{"):
                    try:
                        data = json.loads(body.decode("utf-8"))
                        b64_str = data.get("image", "")
                        if "," in b64_str:
                            b64_str = b64_str.split(",", 1)[1]
                        image_bytes = base64.b64decode(b64_str)
                    except Exception:
                        pass
                if not image_bytes:
                    image_bytes = body
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read image body: {str(e)}")

    if not image_bytes:
        raise HTTPException(status_code=400, detail="No image provided")

    return image_bytes


@router.post("/resolve-image")
async def resolve_image(request: Request, file: Optional[UploadFile] = File(None)):
    image_bytes = await _read_image_bytes(request, file)
    ocr = extract_text_from_image(image_bytes)
    if not ocr.get("success"):
        return {**ocr, "url": None}
    return {**ocr, "url": recover_screenshot_link(ocr.get("text", ""), ocr)}

@router.get("/fetch-metadata")
async def fetch_metadata(url: str = Query(..., description="Target webpage URL")):
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    return scrape_url_metadata(url)
