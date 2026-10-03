"""Run the built site locally without keeping a terminal open."""

from __future__ import annotations

import ctypes
import json
import os
from pathlib import Path
import threading
import time
from urllib.error import URLError
from urllib.request import urlopen
import webbrowser


ROOT = Path(__file__).resolve().parent
URL = "http://localhost:5173"
HEALTH_URL = f"{URL}/api/health"


def message(text: str) -> None:
    ctypes.windll.user32.MessageBoxW(None, text, "随想便签", 0x30)


def is_our_server() -> bool:
    try:
        with urlopen(HEALTH_URL, timeout=1) as response:
            return json.load(response).get("app") == "infinite-canvas-note"
    except (OSError, ValueError, URLError):
        return False


def port_is_busy() -> bool:
    import socket

    try:
        with socket.create_connection(("127.0.0.1", 5173), timeout=1):
            return True
    except OSError:
        return False


def open_when_ready() -> None:
    for _ in range(60):
        if is_our_server():
            webbrowser.open(URL)
            return
        time.sleep(0.25)
    message("本地服务未能启动。请查看本地日志，或重新打开网站。")


def main() -> None:
    if is_our_server():
        webbrowser.open(URL)
        return
    if port_is_busy():
        message("5173 端口已被其他程序占用。请先关闭原来的 npm 开发服务，再双击 open_site.bat。")
        return
    if not (ROOT / "frontend" / "dist" / "index.html").is_file():
        message("缺少网站构建文件。请先在 frontend 目录运行一次 npm run build。")
        return

    os.chdir(ROOT)
    log_dir = Path(os.environ.get("LOCALAPPDATA", ROOT)) / "InfiniteCanvasNote"
    log_dir.mkdir(parents=True, exist_ok=True)
    with (log_dir / "local_site.log").open("a", encoding="utf-8") as log:
        import sys
        sys.stdout = log
        sys.stderr = log
        threading.Thread(target=open_when_ready, daemon=True).start()
        try:
            import uvicorn
            uvicorn.run("backend.main:app", host="127.0.0.1", port=5173, access_log=False)
        except Exception as error:
            print(f"本地服务启动失败：{error!r}", file=log, flush=True)
            message("本地服务启动失败。请查看本地日志：" + str(log_dir / "local_site.log"))


if __name__ == "__main__":
    main()
