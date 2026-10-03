"""Extract links that are actually printed in a screenshot."""

import ipaddress
import re
from urllib.parse import urlparse

from backend.services.screenshot_link_service import recover_visible_link


VISIBLE_URL = re.compile(r"https?://[^\s<>\"'，。；;！!]+", re.I)
TRAILING = "，。,.!?！？；;：:)]}>」』"


def _public_content_url(value: str) -> str | None:
    parsed = urlparse(value)
    host = (parsed.hostname or "").casefold()
    if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
        return None
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        return None
    try:
        if not ipaddress.ip_address(host).is_global:
            return None
    except ValueError:
        if not re.fullmatch(r"(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}", host):
            return None
    if re.search(r"/(?:search|login|signin)(?:/|$)", parsed.path, re.I):
        return None
    return value


def recover_explicit_link(text: str) -> str | None:
    for match in VISIBLE_URL.finditer(text):
        visible = match.group(0).rstrip(TRAILING)
        link = recover_visible_link(visible) or _public_content_url(visible)
        if link:
            return link
    return recover_visible_link(text)
