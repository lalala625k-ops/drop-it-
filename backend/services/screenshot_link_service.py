"""Conservative link recovery from screenshot OCR text."""

import re
from difflib import SequenceMatcher
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from backend.services.screenshot_service import detect_local_proxy
from backend.services.bilibili_reverse_service import recover_bilibili_video


BV_ID = re.compile(r"\bBV[0-9A-Za-z]{10}\b", re.IGNORECASE)
STATUS = re.compile(r"(?:x\.com|twitter\.com)/([A-Za-z0-9_]+)/status(?:es)?/(\d+)", re.IGNORECASE)
VIDEO = re.compile(r"(?:www\.)?bilibili\.com/video/(BV[0-9A-Za-z]{10}|av\d+)", re.IGNORECASE)


def _canonical_link(value: str) -> str | None:
    value = value.strip(" \t\r\n<>\"'()[]，。,.!?！?；;：:")
    if not value.startswith(("http://", "https://")):
        value = "https://" + value
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if host == "b23.tv" and re.fullmatch(r"/[A-Za-z0-9]+/?", parsed.path):
        return f"https://b23.tv{parsed.path.rstrip('/')}"
    if host in {"bilibili.com", "www.bilibili.com", "m.bilibili.com"}:
        match = VIDEO.search(value)
        if match:
            return f"https://www.bilibili.com/video/{match.group(1)}"
    if host in {"x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"}:
        match = STATUS.search(value)
        if match:
            return f"https://x.com/{match.group(1)}/status/{match.group(2)}"
    return None


def _compact(value: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", value, flags=re.UNICODE).lower()


def _search_phrase(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]
    lines = [line for line in lines if 12 <= len(_compact(line)) <= 140
             and not re.search(r"https?://|bilibili\.com|x\.com", line, re.IGNORECASE)]
    return max(lines, key=lambda line: len(_compact(line)), default="")[:100]


def _matches_ocr(phrase: str, result_text: str) -> bool:
    needle = _compact(phrase)
    haystack = _compact(result_text)
    if len(needle) < 12 or not haystack:
        return False
    match = SequenceMatcher(None, needle, haystack, autojunk=False).find_longest_match(0, len(needle), 0, len(haystack))
    return match.size >= 12 and match.size >= min(20, round(len(needle) * 0.6))


def recover_visible_link(text: str) -> str | None:
    """Return only links and BV identifiers printed in the screenshot."""
    for match in re.finditer(r"(?:https?://)?(?:www\.|mobile\.)?(?:bilibili\.com|b23\.tv|x\.com|twitter\.com)/[^\s]+", text, re.IGNORECASE):
        link = _canonical_link(match.group(0))
        if link:
            return link
    bv = BV_ID.search(text)
    return f"https://www.bilibili.com/video/{bv.group(0)}" if bv else None


def recover_screenshot_link(text: str, ocr: dict | None = None) -> str | None:
    # Explicit identifiers are stronger evidence than search results.
    direct = recover_visible_link(text)
    if direct:
        return direct

    if ocr and re.search(r"bilibili|哔哩|大会员|弹幕", text, re.IGNORECASE):
        return recover_bilibili_video(ocr)

    phrase = _search_phrase(text)
    if not phrase:
        return None
    proxy = detect_local_proxy()
    proxies = {"http": proxy, "https": proxy} if proxy else None
    for site in ("bilibili.com", "x.com"):
        try:
            response = requests.get("https://www.bing.com/search", params={"q": f'site:{site} "{phrase}"'},
                                    headers={"User-Agent": "Mozilla/5.0"}, proxies=proxies, timeout=6)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            for result in soup.select("li.b_algo")[:5]:
                anchor = result.select_one("h2 a[href]")
                if not anchor:
                    continue
                link = _canonical_link(anchor.get("href", ""))
                if link and _matches_ocr(phrase, result.get_text(" ", strip=True)):
                    return link
        except requests.RequestException:
            continue
    return None
