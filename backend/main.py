import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.services.data_paths import DATA_DIR, get_assets_dir, get_screenshots_dir
from backend.routes.migration import router as migration_router
from backend.routes.settings import router as settings_router

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


class DynamicStaticFiles(StaticFiles):
    def __init__(self, dir_getter, **kwargs):
        self.dir_getter = dir_getter
        initial_dir = str(dir_getter())
        os.makedirs(initial_dir, exist_ok=True)
        super().__init__(directory=initial_dir, **kwargs)

    def get_path(self, scope):
        current_dir = str(self.dir_getter())
        if self.directory != current_dir:
            self.directory = current_dir
            self.all_directories = [current_dir]
        return super().get_path(scope)


app.mount("/api/screenshots", DynamicStaticFiles(get_screenshots_dir), name="screenshots")
app.mount("/api/assets", DynamicStaticFiles(get_assets_dir), name="assets")

app.include_router(cards_router)
app.include_router(parser_router)
app.include_router(assets_router)
app.include_router(migration_router)
app.include_router(settings_router)

try:
    from backend.services.thumbnail_service import run_batch_pregeneration
    run_batch_pregeneration()
except Exception as e:
    print(f"Warning: Failed to start thumbnail pregeneration: {e}")

@app.get("/api/health")
async def health():
    return {"app": "infinite-canvas-note", "ready": True}

from pathlib import Path
web_dir = Path(os.environ.get("PINBOARD_WEB_DIR", Path(__file__).resolve().parents[1] / "frontend" / "dist"))
if web_dir.is_dir():
    app.mount("/", StaticFiles(directory=web_dir, html=True), name="web")
