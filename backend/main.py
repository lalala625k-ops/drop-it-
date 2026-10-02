import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.services.data_paths import DATA_DIR
from backend.routes.migration import router as migration_router

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from backend.routes.cards import router as cards_router
    from backend.routes.parser import router as parser_router
    from backend.routes.assets import router as assets_router
except ImportError:
    from routes.cards import router as cards_router
    from routes.parser import router as parser_router
    from routes.assets import router as assets_router

app = FastAPI(title="Infinite Canvas Note Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

data_dir = str(DATA_DIR)
screenshots_dir = os.path.join(data_dir, "screenshots")
assets_dir = os.path.join(data_dir, "assets")

os.makedirs(screenshots_dir, exist_ok=True)
os.makedirs(assets_dir, exist_ok=True)

app.mount("/api/screenshots", StaticFiles(directory=screenshots_dir), name="screenshots")
app.mount("/api/assets", StaticFiles(directory=assets_dir), name="assets")

app.include_router(cards_router)
app.include_router(parser_router)
app.include_router(assets_router)
app.include_router(migration_router)

@app.get("/api/health")
async def health():
    return {"app": "infinite-canvas-note", "ready": True}

from pathlib import Path
web_dir = Path(os.environ.get("PINBOARD_WEB_DIR", Path(__file__).resolve().parents[1] / "frontend" / "dist"))
if web_dir.is_dir():
    app.mount("/", StaticFiles(directory=web_dir, html=True), name="web")
