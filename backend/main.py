import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
screenshots_dir = os.path.join(data_dir, "screenshots")
assets_dir = os.path.join(data_dir, "assets")

os.makedirs(screenshots_dir, exist_ok=True)
os.makedirs(assets_dir, exist_ok=True)

app.mount("/api/screenshots", StaticFiles(directory=screenshots_dir), name="screenshots")
app.mount("/api/assets", StaticFiles(directory=assets_dir), name="assets")

app.include_router(cards_router)
app.include_router(parser_router)
app.include_router(assets_router)
