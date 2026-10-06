"""Start and verify the IPv4 Vite server used by the desktop development window."""

import os
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path


def vite_available(port: int = 5173) -> bool:
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f"http://127.0.0.1:{port}/@vite/client", timeout=0.8) as response:
            return response.status == 200 and b"createHotContext" in response.read(131072)
    except (OSError, ValueError):
        return False


def stop_process(process) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=3)


def ensure_vite_server(frontend_dir: Path, port: int = 5173, timeout: float = 30,
                       log_path: Path | None = None, backend_url: str | None = None):
    if vite_available(port):
        return None  # Reused services belong to their original launcher.
    node = shutil.which("node")
    if not node:
        raise RuntimeError("开发模式需要 Node.js，请先安装 Node.js 后重新启动。")
    vite_script = frontend_dir / "node_modules" / "vite" / "bin" / "vite.js"
    if not vite_script.is_file():
        raise RuntimeError("缺少前端开发依赖，请在 frontend 目录执行 npm install 后重新启动。")
    if log_path is None:
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        filename = "vite-dev.log" if port == 5173 else f"vite-dev-{port}.log"
        log_path = base / "InfiniteCanvasNote" / "logs" / filename
    log_path.parent.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    if backend_url:
        environment["PINBOARD_VITE_BACKEND_URL"] = backend_url
    with log_path.open("wb") as log:
        # Launch Node directly: no npm/cmd child process can outlive the window.
        process = subprocess.Popen(
            [node, str(vite_script), "--host", "127.0.0.1", "--port", str(port), "--strictPort"],
            cwd=str(frontend_dir), stdout=log, stderr=subprocess.STDOUT, env=environment,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    try:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"前端开发服务启动失败（退出码 {process.returncode}）。日志：{log_path}")
            if vite_available(port):
                return process
            time.sleep(0.15)
        raise RuntimeError(f"前端开发服务未能在 {timeout:g} 秒内就绪。日志：{log_path}")
    except BaseException:
        stop_process(process)
        raise
