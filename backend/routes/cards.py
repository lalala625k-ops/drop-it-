from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel
from backend.services.storage import load_data_from_disk, save_data_to_disk

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
    collapsed: Optional[bool] = False
    outlinePadding: Optional[float] = None
    tags: Optional[List[str]] = None
    textColor: Optional[str] = None
    borderColor: Optional[str] = None
    reminder: Optional[str] = None

class PersistencePayload(BaseModel):
    cards: List[CardModel]
    groups: Optional[List[GroupModel]] = []

@router.get("")
async def get_cards():
    return load_data_from_disk()

@router.post("")
async def save_cards(payload: PersistencePayload):
    data = {
        "cards": [card.model_dump() for card in payload.cards],
        "groups": [group.model_dump() for group in (payload.groups or [])],
    }
    save_data_to_disk(data)
    return {"success": True, "count": len(payload.cards)}
