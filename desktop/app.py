"""
Infinite Canvas Note - Native Edge WebView2 Desktop Launcher
Uses the system WebView2 runtime and owns its local service lifecycle.

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
import uuid
from pathlib import Path

# Project root is one level above the desktop folder
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
from desktop.close_checkpoint import stop_owned_process as stop_process
from desktop.dev_server import ensure_vite_server, vite_available
# In the distributed build this launcher starts the adjacent frozen backend
# executable; development mode continues to run uvicorn in-process.
IS_FROZEN = bool(getattr(sys, "frozen", False))
os.environ["PINBOARD_APP_ROOT"] = str(Path(sys.executable).resolve().parent if IS_FROZEN else PROJECT_ROOT)

# Safe console output on Windows
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

os.environ["PINBOARD_DESKTOP"] = "1"
is_new_board = "--new-board" in sys.argv
if is_new_board:
    os.environ["PINBOARD_NEW_BOARD"] = "1"
    if not os.environ.get("PINBOARD_DATA_DIR"):
        board_id = uuid.uuid4().hex[:12]
        board_root = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        os.environ["PINBOARD_DATA_DIR"] = str(board_root / "InfiniteCanvasNote" / "boards" / board_id)
dist_dir = PROJECT_ROOT / "frontend" / "dist"
if dist_dir.is_dir():
    os.environ["PINBOARD_WEB_DIR"] = str(dist_dir)
    if (dist_dir / ".empty-release").is_file():
        os.environ["PINBOARD_RELEASE_EMPTY"] = "1"


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


def wait_for_server(url: str, timeout: float = 30.0) -> bool:
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


def stop_services(server, vite_process=None):
    stop_process(vite_process)
    if server:
        if IS_FROZEN:
            stop_process(server)
        else:
            server.should_exit = True


class WindowApi:
    """Small bridge used by the frameless WebView window controls."""

    def __init__(self):
        # Keep the native window private. pywebview recursively inspects the
        # API object while exposing it to JavaScript; a public ``window``
        # attribute pointing back to the pywebview Window creates a cycle and
        # makes the host hang during API injection.
        self._window = None
        self._maximized = False

    def minimize(self):
        if self._window:
            self._window.minimize()

    def toggle_maximize(self):
        if not self._window:
            return
        if self._maximized:
            self._window.restore()
            self._maximized = False
        else:
            self._window.maximize()
            self._maximized = True

    def close(self):
        if self._window:
            self._window.destroy()

    def new_board(self):
        """Open a second desktop window backed by its own empty workspace."""
        env = os.environ.copy()
        env["PINBOARD_NEW_BOARD"] = "1"
        board_id = uuid.uuid4().hex[:12]
        board_root = Path(env.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        env["PINBOARD_DATA_DIR"] = str(board_root / "InfiniteCanvasNote" / "boards" / board_id)
        command = [str(sys.executable)] if IS_FROZEN else [sys.executable, str(Path(__file__).resolve())]
        command.append("--new-board")
        subprocess.Popen(
            command,
            cwd=str(Path(sys.executable).resolve().parent if IS_FROZEN else PROJECT_ROOT),
            env=env,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )


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
    dev_server_active = vite_available()
    # Each development board uses current source with a proxy to its own
    # backend. A static child can otherwise keep obsolete clipboard code.
    use_dev_mode = force_dev or (not IS_FROZEN and dev_server_active)

    # 1. Manage backend server
    # In dev mode, Vite proxies to port 8002 by default
    backend_port = 8002 if use_dev_mode and not is_new_board else find_free_port(8000)
    server_url = f"http://127.0.0.1:{backend_port}"
    server = None

    if check_backend_alive(backend_port):
        print(f"[Desktop] 本地后端服务已在运行中: {server_url}")
    else:
        print(f"[Desktop] 正在启动本地轻量服务: {server_url}")
        if IS_FROZEN:
            backend_path = Path(sys.executable).resolve().with_name("pinboard-service.exe")
            if not backend_path.is_file():
                raise FileNotFoundError(f"缺少后端服务文件: {backend_path}")
            backend_env = os.environ.copy()
            backend_env["PINBOARD_DESKTOP"] = "1"
            backend_env["PINBOARD_PORT"] = str(backend_port)
            server = subprocess.Popen(
                [str(backend_path)],
                cwd=str(backend_path.parent),
                env=backend_env,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
        else:
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
            stop_services(server)
            raise RuntimeError(f"后端服务未能就绪：{server_url}。请检查启动日志后重试。")

    # 2. Determine target URL and mode
    vite_proc = None
    board_query = ""
    if is_new_board:
        board_id = Path(os.environ["PINBOARD_DATA_DIR"]).name
        board_query = f"&new-board=1&board-id={board_id}"
    if use_dev_mode:
        print("[Desktop] 正在检查前端 Vite 热更新服务 (HMR)...")
        try:
            vite_port = find_free_port(5173) if is_new_board else 5173
            vite_proc = ensure_vite_server(PROJECT_ROOT / "frontend", port=vite_port, backend_url=server_url)
        except Exception:
            stop_services(server)
            raise

        target_url = f"http://127.0.0.1:{vite_port}/?desktop=1{board_query}"
        window_title = "DropIt - [热更新开发模式] (Vite HMR Active)"
        print("=" * 60)
        print("【热更新模式已激活】")
        print(f"当前窗口直连 Vite 热更新开发服务 (http://127.0.0.1:{vite_port})")
        print("在代码编辑器中修改并保存任意文件，窗口内将毫秒级自动热替换！")
        print("无需关闭窗口，无需重新启动，画布位置与状态完全保留。")
        print("=" * 60)
    else:
        target_url = f"{server_url}/?desktop=1{board_query}"
        window_title = "Drop-it 0.1"
        print("=" * 60)
        print(f"【独立运行模式】服务地址: {server_url}")
        print("在当前窗口内随时可按 [F5] 或 [Ctrl+R] 刷新重载，无需重启窗口！")
        print("如需体验代码保存即生效的无感热更新，请运行 desktop/run_dev.bat")
        print("=" * 60)

    # 3. Create a frameless Edge WebView2 window. The React shell supplies the
    # three lightweight controls because the native title bar is intentionally hidden.
    window_api = WindowApi()
    webview.settings['DRAG_REGION_SELECTOR'] = '.pywebview-drag-region'
    webview.settings['DRAG_REGION_DIRECT_TARGET_ONLY'] = True
    window = webview.create_window(
        title=window_title,
        url=target_url,
        js_api=window_api,
        width=1400,
        height=900,
        min_size=(900, 600),
        frameless=True,
        easy_drag=True,
        shadow=False,
        background_color="#D6D3CB",
        text_select=True,
    )
    window_api._window = window

    from desktop.close_checkpoint import attach_close_checkpoint
    attach_close_checkpoint(window)

    try:
        webview.start(gui="edgechromium", debug=use_dev_mode or "--debug" in sys.argv)
    except Exception as e:
        print(f"[Desktop] Webview window error: {e}")
        traceback.print_exc()
        input("Press Enter to exit...")
    finally:
        stop_services(server, vite_proc)
        sys.exit(0)


if __name__ == "__main__":
    try:
        start_desktop()
    except Exception as e:
        print(f"[Fatal Error]: {e}")
        traceback.print_exc()
        input("Press Enter to exit...")
        sys.exit(1)
