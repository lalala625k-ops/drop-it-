"""QR precheck helpers."""

import ipaddress
import re
from urllib.parse import urlparse


def detect_qr_link(image_bytes: bytes) -> str | None:
    try:
        import cv2
        import numpy as np

        image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            return None
        value, _, _ = cv2.QRCodeDetector().detectAndDecode(image)
        value = value.strip()
        if value.startswith("bilibili://"):
            match = re.search(r"BV[0-9A-Za-z]{10}", value, re.I)
            return f"https://www.bilibili.com/video/{match.group(0)}" if match else None
        parsed = urlparse(value)
        host = parsed.hostname or ""
        if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
            return None
        if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
            return None
        try:
            if not ipaddress.ip_address(host).is_global:
                return None
        except ValueError:
            pass
        return value
    except Exception:
        return None
