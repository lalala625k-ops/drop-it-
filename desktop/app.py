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
import traceback
import urllib.request
from pathlib import Path

# Project root is one level above the desktop folder
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Safe console output on Windows
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

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


def check_backend_alive(port: int) -> bool:
    """Check if an active backend is already responding on the port."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=0.8) as resp:
            return resp.status == 200
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
            time.sleep(0.15)
    return False


def start_desktop():
    try:
        import uvicorn
        import webview
    except ImportError as e:
        print(f"[Error] Missing dependency: {e}")
        print("Please ensure pywebview and uvicorn are installed.")
        input("Press Enter to exit...")
        sys.exit(1)

    force_dev = "--dev" in sys.argv
    dev_server_active = is_port_active("127.0.0.1", 5173)
    use_dev_mode = force_dev or dev_server_active

    # 1. Manage backend server
    # In dev mode, Vite proxies to port 8002 by default
    backend_port = 8002 if use_dev_mode else find_free_port(8000)
    server_url = f"http://127.0.0.1:{backend_port}"
    server = None

    if check_backend_alive(backend_port):
        print(f"[Desktop] 本地后端服务已在运行中: {server_url}")
    else:
        print(f"[Desktop] 正在启动本地轻量服务: {server_url}")
        config = uvicorn.Config(
            "backend.main:app",
            host="127.0.0.1",
            port=backend_port,
            log_level="warning",
            access_log=False,
        )
        server = uvicorn.Server(config)
        server_thread = threading.Thread(target=server.run, daemon=True, name="BackendServerThread")
        server_thread.start()

        if not wait_for_server(server_url):
            print(f"[Desktop] Warning: Backend server took long to respond at {server_url}.")

    # 2. Determine target URL and mode
    vite_proc = None
    if use_dev_mode:
        if not dev_server_active:
            print("[Desktop] 正在启动前端 Vite 热更新服务 (HMR)...")
            vite_proc = subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=str(PROJECT_ROOT / "frontend"),
                shell=True,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
            )
            # Wait up to 15 seconds for Vite port 5173
            for _ in range(60):
                if is_port_active("127.0.0.1", 5173):
                    break
                time.sleep(0.25)

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
    except Exception as e:
        print(f"[Desktop] Webview window error: {e}")
        traceback.print_exc()
        input("Press Enter to exit...")
    finally:
        if server:
            server.should_exit = True
        sys.exit(0)


if __name__ == "__main__":
    try:
        start_desktop()
    except Exception as e:
        print(f"[Fatal Error]: {e}")
        traceback.print_exc()
        input("Press Enter to exit...")
