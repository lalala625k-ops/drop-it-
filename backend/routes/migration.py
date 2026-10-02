import base64
import hashlib
import json
import os
import secrets
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.services.data_paths import DATA_DIR, ASSETS_DIR
from backend.services.storage import load_data_from_disk, replace_all, backup_database, RevisionConflict

router = APIRouter(prefix="/api/migration", tags=["migration"])
MIGRATION_TOKEN = os.environ.get("PINBOARD_MIGRATION_TOKEN") or secrets.token_hex(24)


class BrowserMigration(BaseModel):
    token: str
    baseRevision: int
    cards: list[dict]
    groups: list[dict]
    images: dict[str, str] = {}
    viewport: dict | None = None
    pendingSync: bool = False


@router.get("/status")
async def migration_status():
    return {"needed": not (DATA_DIR / "browser-migration-complete").exists()}


@router.get("/token")
async def migration_token(request: Request):
    if request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(status_code=403, detail="Local access only")
    return {"token": MIGRATION_TOKEN}


@router.post("")
async def import_browser(payload: BrowserMigration):
    if payload.token != MIGRATION_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid migration token")
    if (DATA_DIR / "browser-migration-complete").exists():
        raise HTTPException(status_code=409, detail="Browser data already migrated")
    current = load_data_from_disk()
    if current["revision"] != payload.baseRevision:
        raise HTTPException(status_code=409, detail="Board changed during migration")
    backup = DATA_DIR / "browser-migration-backup"
    backup.mkdir(exist_ok=True)
    backup_database(backup / "board.sqlite3")
    if payload.pendingSync:
        cards = payload.cards
        groups = payload.groups
    else:
        cards = current["cards"]
        groups = current["groups"]
    for card in cards:
        image = payload.images.get(str(card.get("id")))
        if not image or not image.startswith("data:image/"):
            continue
        if card.get("image") and not str(card["image"]).startswith("data:image/"):
            continue
        try:
            header, encoded = image.split(",", 1)
            extension = "png" if "png" in header else "webp" if "webp" in header else "jpg"
            raw = base64.b64decode(encoded, validate=True)
            filename = hashlib.sha256(raw).hexdigest()[:16] + "." + extension
            (ASSETS_DIR / filename).write_bytes(raw)
            card["image"] = "/api/assets/" + filename
        except (ValueError, base64.binascii.Error):
            raise HTTPException(status_code=422, detail=f"Invalid image for {card.get('id')}")
    try:
        replace_all(payload.baseRevision, {"cards": cards, "groups": groups})
    except RevisionConflict:
        raise HTTPException(status_code=409, detail="Board changed during migration")
    saved = load_data_from_disk()
    if {card["id"] for card in saved["cards"]} != {card["id"] for card in cards} or \
            {group["id"] for group in saved["groups"]} != {group["id"] for group in groups}:
        raise HTTPException(status_code=500, detail="Migration verification failed; backup preserved")
    for card in saved["cards"]:
        image = card.get("image", "") or ""
        if image.startswith("/api/assets/") and not (ASSETS_DIR / image.rsplit("/", 1)[-1]).is_file():
            raise HTTPException(status_code=500, detail=f"Missing image for {card['id']}; backup preserved")
    if payload.viewport:
        (DATA_DIR / "migrated-viewport.json").write_text(json.dumps(payload.viewport), encoding="utf-8")
    (DATA_DIR / "browser-migration-complete").write_text("done", encoding="utf-8")
    return {"success": True, "cards": len(cards), "groups": len(groups)}


@router.get("/viewport")
async def migrated_viewport():
    path = DATA_DIR / "migrated-viewport.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
