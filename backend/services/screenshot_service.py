import os
import hashlib
import socket
import subprocess
from typing import Optional
from backend.services.data_paths import SCREENSHOTS_DIR

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def detect_local_proxy() -> Optional[str]:
    """Auto-detect common local proxy ports (Clash, v2ray, etc.) if active."""
    for port in [7897, 7890, 10808, 10809]:
        try:
            s = socket.socket()
            s.settimeout(0.15)
            s.connect(("127.0.0.1", port))
            s.close()
            return f"http://127.0.0.1:{port}"
        except Exception:
            pass
    return None

def find_browser_executable() -> Optional[str]:
    """Find installed Chrome or Edge executable on the system."""
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None

AUTH_DOMAINS_AND_KEYWORDS = [
    "accounts.feishu.cn", "passport.feishu.cn", "passport.",
    "login.", "signin.", "auth.", "sso.", "/login", "/signin", "/auth"
]

def is_auth_url(url: str) -> bool:
    lower = url.lower()
    return any(k in lower for k in AUTH_DOMAINS_AND_KEYWORDS)

def capture_screenshot_fallback(url: str, timeout: int = 10) -> Optional[str]:
    """
    Captures a viewport screenshot using headless Chrome or Edge when og:image is absent.
    Returns relative endpoint path: /api/screenshots/{filename}.jpg
    """
    if is_auth_url(url):
        return None

    browser = find_browser_executable()
    if not browser:
        return None

    url_hash = hashlib.md5(url.encode("utf-8")).hexdigest()[:16]
    filename = f"{url_hash}.jpg"
    out_path = os.path.join(SCREENSHOTS_DIR, filename)

    # Return cached screenshot if already captured and non-empty
    if os.path.exists(out_path) and os.path.getsize(out_path) > 1024:
        return f"/api/screenshots/{filename}"

    proxy = detect_local_proxy()
    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1280,800",
        "--hide-scrollbars",
        f"--screenshot={out_path}",
        "--run-all-compositor-stages-before-draw",
    ]
    if proxy:
        cmd.append(f"--proxy-server={proxy}")
    cmd.append(url)

    try:
        subprocess.run(cmd, capture_output=True, timeout=timeout)
        if os.path.exists(out_path) and os.path.getsize(out_path) > 1024:
            return f"/api/screenshots/{filename}"
    except Exception as e:
        print(f"Screenshot fallback error for {url}: {e}")

    return None
