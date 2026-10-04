"""
Infinite Canvas Note - Native Edge WebView2 Desktop Launcher
Lightweight (~25MB memory overhead), single-process lifecycle, zero Electron bloat.

Supports:
1. Vite HMR (Live Hot Reloading in the open window without restart)
2. Production Standalone Mode (F5 / Ctrl+R in-window reload)
3. Automatic port allocation and graceful shutdown
"""

import os
import sys
import time
import socket
import threading
import subprocess
import urllib.request
from pathlib import Path

# Project root is one level above the desktop folder
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Set desktop environment markers
os.environ["PINBOARD_DESKTOP"] = "1"
dist_dir = PROJECT_ROOT / "frontend" / "dist"
if dist_dir.is_dir():
    os.environ["PINBOARD_WEB_DIR"] = str(dist_dir)


def is_port_active(host: str, port: int) -> bool:
    """Check if a specific TCP port is listening."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.3)
            return s.connect_ex((host, port)) == 0
    except Exception:
        return False


def find_free_port(preferred_port: int = 8000) -> int:
    """Check if preferred port is available, otherwise pick a free ephemeral port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("127.0.0.1", preferred_port))
            return preferred_port
        except OSError:
            pass

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

    force_dev = "--dev" in sys.argv
    dev_server_active = is_port_active("127.0.0.1", 5173)

    # 1. Start or check backend service
    port = find_free_port(8000)
    server_url = f"http://127.0.0.1:{port}"

    config = uvicorn.Config(
        "backend.main:app",
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    server_thread = threading.Thread(target=server.run, daemon=True, name="BackendServerThread")
    server_thread.start()

    if not wait_for_server(server_url):
        print(f"[Desktop] Warning: Backend server took long to respond at {server_url}.")

    # 2. Determine target URL and mode
    use_dev_mode = force_dev or dev_server_active

    if use_dev_mode:
        if not dev_server_active:
            print("[Desktop] 正在启动前端 Vite 热更新服务...")
            subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=str(PROJECT_ROOT / "frontend"),
                shell=True,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
            )
            for _ in range(25):
                if is_port_active("127.0.0.1", 5173):
                    break
                time.sleep(0.2)

        target_url = "http://127.0.0.1:5173"
        window_title = "便签看板 - [热更新开发模式] (Vite HMR Active)"
        print("=" * 60)
        print("【热更新模式已激活】")
        print("当前窗口直连 Vite 热更新开发服务 (http://127.0.0.1:5173)")
        print("在代码编辑器中修改并保存任意文件，窗口内将毫秒级自动热替换！")
        print("无需关闭窗口，无需重新启动，画布位置与状态完全保留。")
        print("=" * 60)
    else:
        target_url = server_url
        window_title = "便签看板 - Infinite Canvas Note"
        print("=" * 60)
        print(f"【独立运行模式】服务地址: {server_url}")
        print("在当前窗口内随时可按 [F5] 或 [Ctrl+R] 刷新重载，无需重启窗口！")
        print("如需体验代码保存即生效的无感热更新，请运行 desktop/run_dev.bat")
        print("=" * 60)

    # 3. Create Edge WebView2 Window
    window = webview.create_window(
        title=window_title,
        url=target_url,
        width=1400,
        height=900,
        min_size=(900, 600),
        background_color="#FFFFFF",
        text_select=True,
    )

    try:
        webview.start(gui="edgechromium", debug=use_dev_mode or "--debug" in sys.argv)
    finally:
        server.should_exit = True
        sys.exit(0)


if __name__ == "__main__":
    start_desktop()
