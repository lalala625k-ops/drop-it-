from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.atomic_files import locked_workspace
from backend.services.storage import (
    load_data_from_disk, get_revision as read_revision, apply_changes, replace_all, RevisionConflict,
    get_pins_from_disk, save_pins_to_disk
)

router = APIRouter(prefix="/api/cards", tags=["cards"])

class CardModel(BaseModel):
    id: str
    type: str  # 'image' | 'web' | 'text'
    x: float
    y: float
    width: float
    height: float
    zIndex: int
    groupId: Optional[str] = None
    bundleId: Optional[str] = None
    content: Optional[str] = None
    title: Optional[str] = None
    headerTitle: Optional[str] = None
    url: Optional[str] = None
    image: Optional[str] = None
    description: Optional[str] = None
    favicon: Optional[str] = None
    reminder: Optional[str] = None
    tags: Optional[List[str]] = None
    sizeLocked: Optional[bool] = None
    defaultWidth: Optional[float] = None
    defaultHeight: Optional[float] = None
    contentScale: Optional[float] = None
    color: Optional[str] = None
    textColor: Optional[str] = None
    borderColor: Optional[str] = None

class GroupModel(BaseModel):
    id: str
    title: str
    x: float
    y: float
    width: float
    height: float
    color: Optional[str] = None
    zIndex: Optional[int] = 0
    kind: Optional[str] = None
    parentIds: Optional[List[str]] = None
    collapsed: Optional[bool] = False
    outlinePadding: Optional[float] = None
    tags: Optional[List[str]] = None
    textColor: Optional[str] = None
    borderColor: Optional[str] = None
    reminder: Optional[str] = None

class PersistencePayload(BaseModel):
    cards: List[CardModel]
    groups: Optional[List[GroupModel]] = []
    baseRevision: int

class ChangesPayload(BaseModel):
    baseRevision: int
    upsertCards: List[CardModel] = []
    upsertGroups: List[GroupModel] = []
    deleteCardIds: List[str] = []
    deleteGroupIds: List[str] = []

@router.get("")
async def get_cards():
    return load_data_from_disk()

@router.post("")
@locked_workspace
def save_cards(payload: PersistencePayload):
    data = {
        "cards": [card.model_dump() for card in payload.cards],
        "groups": [group.model_dump() for group in (payload.groups or [])],
    }
    try:
        revision = replace_all(payload.baseRevision, data)
    except RevisionConflict:
        raise HTTPException(status_code=409, detail="Board changed in another window")
    return {"success": True, "count": len(payload.cards), "revision": revision}

@router.post("/changes")
@locked_workspace
def save_changes(payload: ChangesPayload):
    try:
        revision = apply_changes(
            payload.baseRevision,
            [card.model_dump() for card in payload.upsertCards],
            [group.model_dump() for group in payload.upsertGroups],
            payload.deleteCardIds, payload.deleteGroupIds,
        )
    except RevisionConflict:
        raise HTTPException(status_code=409, detail="Board changed in another window")
    return {"success": True, "revision": revision}

@router.get("/revision")
async def get_revision():
    return {"revision": read_revision()}

@router.get("/pins")
async def get_pins():
    return {"pins": get_pins_from_disk()}

@router.post("/pins")
@locked_workspace
def save_pins(payload: List[dict]):
    save_pins_to_disk(payload)
    return {"success": True, "count": len(payload)}
