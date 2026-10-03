"""Find a Bilibili video from OCR layout without changing protected scrapers."""

import html
import re
from difflib import SequenceMatcher
from typing import Any

import requests
from backend.services.reverse_trace import record
from bs4 import BeautifulSoup

from backend.services.screenshot_service import detect_local_proxy


SEARCH_URLS = (
    "https://api.bilibili.com/x/web-interface/wbi/search/type",
    "https://api.bilibili.com/x/web-interface/search/all/v2",
    "https://api.bilibili.com/x/web-interface/search/type",
)
BVID = re.compile(r"BV[0-9A-Za-z]{10}\b", re.IGNORECASE)
USERNAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{4,29}$")
DURATION = re.compile(r"\d{1,2}:\d{2}\s*/\s*(\d{1,2}:\d{2}(?::\d{2})?)")
_verified_links: dict[tuple[str, str], str] = {}


def _compact(value: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", value, flags=re.UNICODE).casefold()


def _center(box: list[list[float]]) -> tuple[float, float]:
    return (sum(point[0] for point in box) / len(box),
            sum(point[1] for point in box) / len(box))


def _seconds(value: str) -> int | None:
    try:
        parts = [int(part) for part in value.split(":")]
        return sum(part * 60 ** index for index, part in enumerate(reversed(parts)))
    except ValueError:
        return None


def _mobile_clues(ocr: dict[str, Any]) -> tuple[str, str, int | None] | None:
    width, height = ocr.get("width", 0), ocr.get("height", 0)
    if not width or height < width * 1.3:
        return None
    lines: list[tuple[float, float, str]] = []
    for entry in ocr.get("lines", []):
        box = entry.get("box")
        value = str(entry.get("text", "")).strip()
        if box and value:
            lines.append((min(point[0] for point in box), _center(box)[1], value))

    candidates = [(x, y, value) for x, y, value in lines
                  if height * 0.68 < y < height * 0.87 and x < width * 0.18
                  and len(_compact(value)) >= 18
                  and not re.search(r"播放|粉丝|关注|搜索|弹幕", value)]
    if not candidates:
        return None
    _, title_y, first = max(candidates, key=lambda line: len(_compact(line[2])))
    continuation = next((value for x, y, value in sorted(lines, key=lambda line: line[1])
                         if title_y + 12 < y < title_y + height * 0.05
                         and x < width * 0.18 and len(_compact(value)) >= 8
                         and not re.search(r"播放|粉丝|关注|搜索|弹幕", value)), "")
    title = re.sub(r"^分集\s*[·・]?\s*第\s*\d+\s*集\s*[丨|｜]?\s*", "", first + continuation)
    authors = [(y, value) for x, y, value in lines
               if title_y - height * 0.12 < y < title_y - height * 0.035
               and x < width * 0.3 and 2 <= len(_compact(value)) <= 20
               and not re.search(r"粉丝|关注|播放|正在看", value)]
    author = max(authors, key=lambda line: line[0])[1] if authors else ""
    return (title, author, None) if len(_compact(title)) >= 12 else None


def _page_clues(ocr: dict[str, Any]) -> tuple[str, str, int | None] | None:
    text = ocr.get("text", "")
    if not any(marker in text.casefold() for marker in ("bilibili", "哔哩", "大会员", "弹幕")):
        return None
    width, height = ocr.get("width", 0), ocr.get("height", 0)
    if not width or not height:
        return None
    if height > width * 1.3:
        return _mobile_clues(ocr)

    rows: list[dict[str, Any]] = []
    authors: list[tuple[float, str]] = []
    for entry in ocr.get("lines", []):
        box = entry.get("box")
        value = str(entry.get("text", "")).strip()
        if not box or not value:
            continue
        x, y = _center(box)
        if y < height * 0.35 and USERNAME.fullmatch(value) and value.casefold() not in {"bilibili", "youtube"}:
            authors.append((y, value))
        if not (width * 0.03 < x < width * 0.7 and height * 0.01 < y < height * 0.22):
            continue
        row = next((row for row in rows if abs(row["y"] - y) <= max(16, height * 0.018)), None)
        if row is None:
            row = {"y": y, "parts": []}
            rows.append(row)
        row["parts"].append((x, value))

    title_rows = [row for row in rows if len(row["parts"]) <= 4
                  and max((len(re.findall(r"[\u4e00-\u9fff]", value)) for _, value in row["parts"]), default=0) >= 10]
    title_row = max(title_rows, key=lambda row: len(re.findall(
        r"[\u4e00-\u9fff]", "".join(value for _, value in row["parts"]))), default=None)
    title = "".join(value for _, value in sorted(title_row["parts"])) if title_row else ""
    if len(_compact(title)) < 12:
        return None
    title_y = title_row["y"]
    author = min(authors, key=lambda item: abs(item[0] - title_y))[1] if authors else ""
    match = DURATION.search(text)
    return title, author, _seconds(match.group(1)) if match else None


def _candidate_score(item: dict[str, Any], title: str, author: str, duration: int | None) -> float:
    found_title = BeautifulSoup(html.unescape(str(item.get("title", ""))), "html.parser").get_text()
    title_score = SequenceMatcher(None, _compact(title), _compact(found_title), autojunk=False).ratio()
    if title_score < 0.82:
        return 0.0
    author_match = bool(author and _compact(author) == _compact(str(item.get("author", ""))))
    found_duration = _seconds(str(item.get("duration", "")))
    duration_match = duration is not None and found_duration is not None and abs(duration - found_duration) <= 3
    return title_score + (0.12 if author_match else 0) + (0.08 if duration_match else 0)


def _search_page(query: str, page: int, headers: dict[str, str], proxies: dict[str, str] | None,
                 order: str | None = "pubdate") -> dict[str, Any] | None:
    # A failed endpoint must not multiply into minutes of retries per page.
    for url in SEARCH_URLS[:2]:
        try:
            params = {"keyword": query, "page": page}
            if "/search/type" in url:
                params["search_type"] = "video"
            if order:
                params["order"] = order
            response = requests.get(url, params=params,
                                    headers=headers, proxies=proxies, timeout=4)
            record('site_request', 'completed' if response.ok else 'failed', f'B 站备用搜索：{query[:80]}', url, response.status_code)
            if response.status_code != 200:
                continue
            payload = response.json()
            if payload.get("code") == 0:
                data = payload.get("data") or {}
                if "v_voucher" not in data:
                    if isinstance(data.get("result"), list) and data["result"] and "result_type" in data["result"][0]:
                        videos = next((group.get("data") or [] for group in data["result"]
                                       if group.get("result_type") == "video"), [])
                        return {"result": videos, "numPages": data.get("numPages", 2)}
                    return data
        except (requests.RequestException, ValueError, TypeError):
            record('site_request', 'failed', f'B 站备用搜索异常：{query[:80]}', url)
            continue
    return None


def recover_bilibili_video(ocr: dict[str, Any]) -> str | None:
    clues = _page_clues(ocr)
    if not clues:
        return None
    title, author, duration = clues
    cache_key = (_compact(title), _compact(author))
    if cache_key in _verified_links:
        return _verified_links[cache_key]
    mobile = ocr.get("height", 0) > ocr.get("width", 0) * 1.3
    distinctive = re.search(r"[A-Za-z][A-Za-z0-9]{5,29}", title)
    queries = ([(distinctive.group(0), None), (title[:24], None)]
               if mobile and distinctive else
               [(title[:24], None), (title[-16:], None)])
    proxy = detect_local_proxy()
    proxies = {"http": proxy, "https": proxy} if proxy else None
    headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/"}
    best: tuple[float, str] = (0.0, "")
    for query, order in queries:
        if not query:
            continue
        for page in range(1, 3):
            data = _search_page(query, page, headers, proxies, order)
            if data is None:
                break
            for item in data.get("result") or []:
                bvid = str(item.get("bvid") or "")
                if not BVID.fullmatch(bvid):
                    continue
                score = _candidate_score(item, title, author, duration)
                if score > best[0]:
                    best = score, bvid
            if best[0] >= 1.0 or page >= data.get("numPages", 2):
                break
        if best[0] >= 1.0:
            break

    if best[0] >= 1.0:
        link = f"https://www.bilibili.com/video/{best[1]}"
        if len(_verified_links) >= 128:
            _verified_links.pop(next(iter(_verified_links)))
        _verified_links[cache_key] = link
        return link
    return None
