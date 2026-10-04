import io
import os
import json
import zipfile
import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.services.data_paths import (
    get_data_dir, get_assets_dir, get_screenshots_dir, set_custom_data_dir
)
from backend.services.storage import load_data_from_disk, force_replace_all

router = APIRouter(prefix="/api", tags=["settings_and_archive"])


class StoragePathUpdatePayload(BaseModel):
    new_path: str
    migrate_data: bool = True


class ArchiveExportPayload(BaseModel):
    viewport: Optional[Dict[str, Any]] = None
    pins: Optional[List[Dict[str, Any]]] = None
    cards: Optional[List[Dict[str, Any]]] = None
    groups: Optional[List[Dict[str, Any]]] = None


@router.get("/settings/storage-path")
async def get_storage_path():
    current = get_data_dir()
    default_base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    default_path = (default_base / "InfiniteCanvasNote" / "data").resolve()
    return {
        "current_path": str(current),
        "default_path": str(default_path),
        "is_default": current == default_path,
    }


@router.post("/settings/storage-path")
async def update_storage_path(payload: StoragePathUpdatePayload):
    new_path_str = payload.new_path.strip()
    if not new_path_str:
        raise HTTPException(status_code=400, detail="保存路径不能为空")
    try:
        result = set_custom_data_dir(new_path_str, payload.migrate_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更改存储目录失败: {str(e)}")


@router.post("/archive/export")
async def export_archive(payload: ArchiveExportPayload):
    # Retrieve cards and groups
    cards = payload.cards
    groups = payload.groups
    if cards is None or groups is None:
        disk_data = load_data_from_disk()
        if cards is None:
            cards = disk_data.get("cards", [])
        if groups is None:
            groups = disk_data.get("groups", [])

    now_str = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    meta = {
        "version": "1.0",
        "exportedAt": datetime.datetime.now().isoformat(),
        "viewport": payload.viewport or {"x": 0, "y": 0, "zoom": 1.0},
        "pins": payload.pins or [],
        "cards": cards,
        "groups": groups,
    }

    # Collect referenced assets
    assets_dir = get_assets_dir()
    screenshots_dir = get_screenshots_dir()

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # Write metadata
        zf.writestr("meta.json", json.dumps(meta, ensure_ascii=False, indent=2))

        # Pack all files in assets_dir
        if assets_dir.is_dir():
            for item in assets_dir.iterdir():
                if item.is_file():
                    try:
                        zf.write(item, arcname=f"assets/{item.name}")
                    except Exception:
                        pass

        # Pack all files in screenshots_dir
        if screenshots_dir.is_dir():
            for item in screenshots_dir.iterdir():
                if item.is_file():
                    try:
                        zf.write(item, arcname=f"screenshots/{item.name}")
                    except Exception:
                        pass

    zip_buffer.seek(0)
    filename = f"canvas_archive_{now_str}.note"
    return StreamingResponse(
        zip_buffer,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/archive/import")
async def import_archive(file: UploadFile = File(...)):
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="上传文件为空")

    try:
        zip_buffer = io.BytesIO(contents)
        with zipfile.ZipFile(zip_buffer, mode="r") as zf:
            namelist = zf.namelist()
            if "meta.json" not in namelist:
                raise HTTPException(status_code=400, detail="便签包损坏或缺少 meta.json")

            meta_raw = zf.read("meta.json").decode("utf-8")
            meta = json.loads(meta_raw)

            cards = meta.get("cards", [])
            groups = meta.get("groups", [])
            viewport = meta.get("viewport")
            pins = meta.get("pins", [])

            # Extract assets
            target_assets = get_assets_dir()
            target_screenshots = get_screenshots_dir()
            target_assets.mkdir(parents=True, exist_ok=True)
            target_screenshots.mkdir(parents=True, exist_ok=True)

            for name in namelist:
                if name.startswith("assets/") and len(name) > len("assets/"):
                    fname = os.path.basename(name)
                    if fname:
                        target_file = target_assets / fname
                        with zf.open(name) as src, open(target_file, "wb") as dst:
                            dst.write(src.read())

                elif name.startswith("screenshots/") and len(name) > len("screenshots/"):
                    fname = os.path.basename(name)
                    if fname:
                        target_file = target_screenshots / fname
                        with zf.open(name) as src, open(target_file, "wb") as dst:
                            dst.write(src.read())

            # Replace in database
            revision = force_replace_all({"cards": cards, "groups": groups})

            return {
                "success": True,
                "cards": cards,
                "groups": groups,
                "viewport": viewport,
                "pins": pins,
                "revision": revision,
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入便签包失败: {str(e)}")
