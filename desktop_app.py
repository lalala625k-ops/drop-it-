"""
Infinite Canvas Note - Native Edge WebView2 Desktop Launcher
Lightweight (~25MB memory overhead), single-process lifecycle, zero Electron bloat.
"""

import os
import sys
import time
import socket
import threading
import urllib.request
from pathlib import Path

# Ensure root directory is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

# Set desktop environment markers
os.environ["PINBOARD_DESKTOP"] = "1"
dist_dir = PROJECT_ROOT / "frontend" / "dist"
if dist_dir.is_dir():
    os.environ["PINBOARD_WEB_DIR"] = str(dist_dir)


def find_free_port(preferred_port: int = 8000) -> int:
    """Check if preferred port is available, otherwise pick a free ephemeral port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("127.0.0.1", preferred_port))
            return preferred_port
        except OSError:
            pass

    # Pick an ephemeral port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for_server(url: str, timeout: float = 8.0) -> bool:
    """Poll health endpoint until backend is fully initialized."""
    start_time = time.monotonic()
    while time.monotonic() - start_time < timeout:
        try:
            with urllib.request.urlopen(f"{url}/api/health", timeout=1.0) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.1)
    return False


def start_desktop():
    import uvicorn
    import webview

    port = find_free_port(8000)
    server_url = f"http://127.0.0.1:{port}"

    # Configure uvicorn local server
    config = uvicorn.Config(
        "backend.main:app",
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)

    # Start FastAPI in a background daemon thread
    server_thread = threading.Thread(target=server.run, daemon=True, name="BackendServerThread")
    server_thread.start()

    # Wait for server ready
    if not wait_for_server(server_url):
        print(f"[Desktop] Error: Backend server did not respond at {server_url} within timeout.")

    # Create native Edge WebView2 window
    window = webview.create_window(
        title="便签看板 - Infinite Canvas Note",
        url=server_url,
        width=1400,
        height=900,
        min_size=(900, 600),
        background_color="#FFFFFF",
        text_select=True,
    )

    # Start webview using native Edge Chromium (WebView2)
    try:
        webview.start(gui="edgechromium", debug=False)
    finally:
        # Graceful shutdown of uvicorn when window closes
        server.should_exit = True
        sys.exit(0)


if __name__ == "__main__":
    start_desktop()
