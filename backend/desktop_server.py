import os
import sys
from pathlib import Path

import uvicorn

if getattr(sys, "frozen", False):
    os.environ.setdefault("PINBOARD_WEB_DIR", str(Path(sys._MEIPASS) / "web"))
os.environ["PINBOARD_DESKTOP"] = "1"

from backend.main import app


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=int(os.environ.get("PINBOARD_PORT", "8000")),
        log_level="warning",
    )
