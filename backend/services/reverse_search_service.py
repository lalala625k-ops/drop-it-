"""Find a concrete source page from screenshot text or optional visual clues."""

import re
from difflib import SequenceMatcher
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from backend.services.reverse_vision_service import extract_visual_clues
from backend.services.reverse_platform_service import recover_platform_link
from backend.services.reverse_platform_adapter import recover_imported_link
from backend.services.reverse_platforms.general import DOMAIN_TO_PLATFORM_KEY
from backend.services.reverse_layout_service import extract_layout_clues
from backend.services.bilibili_reverse_service import _page_clues, recover_bilibili_video
from backend.services.screenshot_service import detect_local_proxy


PLATFORMS = {
    "bilibili": ("bilibili.com", r"/video/(?:BV[0-9A-Za-z]{10}|av\d+)"),
    "twitter": ("x.com", r"/(?:[^/]+/status/\d+|i/article/\d+)"),
    "instagram": ("instagram.com", r"/(?:p|reel|tv)/[A-Za-z0-9_-]+"),
    "youtube": ("youtube.com", r"/(?:watch|shorts)/|/watch\?v="),
    "wechat": ("mp.weixin.qq.com", r"/s(?:/|\?|$)"),
    "feishu": ("feishu.cn", r"/(?:wiki|docx|docs|sheets|base)/[A-Za-z0-9_-]+"),
    "zhihu": ("zhihu.com", r"/(?:p|question)/\d+"),
    "xiaohongshu": ("xiaohongshu.com", r"/(?:explore|discovery/item)/"),
    "weibo": ("weibo.com", r"/(?:\d+/[A-Za-z0-9]+|detail/\d+)"),
    "sspai": ("sspai.com", r"/post/\d+"),
    "thepaper": ("thepaper.cn", r"/newsDetail_forward_\d+"),
    "juejin": ("juejin.cn", r"/post/\d+"),
    "csdn": ("blog.csdn.net", r"/[^/]+/article/details/\d+"),
    "github": ("github.com", r"/[^/]+/[^/]+/?$"),
}
MARKERS = {
    "bilibili": ("bilibili", "哔哩哔哩", "弹幕"),
    "twitter": ("twitter", "x.com", "retweet"),
    "instagram": ("instagram", "reels", "查看翻译"),
    "youtube": ("youtube", "subscribe", "subscribers"),
    "wechat": ("公众号", "写留言", "在看", "mp.weixin.qq.com"),
    "feishu": ("飞书文档", "feishu.cn", "larksuite"),
    "zhihu": ("知乎", "赞同", "写回答"),
    "xiaohongshu": ("小红书", "小红书号"),
    "weibo": ("微博", "weibo"),
    "sspai": ("少数派", "sspai"),
    "thepaper": ("澎湃", "thepaper"),
    "juejin": ("掘金", "juejin"),
    "csdn": ("csdn",),
    "github": ("github", "star fork"),
}
NOISE = re.compile(r"广告|推广|相关推荐|接下来播放|热门推荐|评论|弹幕|关注|分享|收藏|搜索|登录|注册|首页", re.I)
_UNSET = object()


def _compact(value: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", value, flags=re.UNICODE).casefold()


def _ocr_title(ocr: dict) -> str:
    lines = ocr.get("lines") or []
    width, height = ocr.get("width") or 0, ocr.get("height") or 0
    candidates = []
    for item in lines:
        title = str(item.get("text") or "").strip()
        box = item.get("box") or []
        if len(_compact(title)) < 10 or NOISE.search(title) or not box:
            continue
        x = sum(point[0] for point in box) / len(box)
        y = sum(point[1] for point in box) / len(box)
        vertical = height > width * 1.3
        if width and height and (x > width * 0.75 or y < height * 0.06
                                 or y > height * (0.56 if vertical else 0.72)):
            continue
        font_height = max(point[1] for point in box) - min(point[1] for point in box)
        candidates.append((title, y, font_height))
    if not candidates:
        return ""
    # Favor prominent text near the primary content area.
    max_font = max(item[2] for item in candidates) or 1
    target_y = height * (0.32 if height > width * 1.3 else 0.16)
    candidates.sort(key=lambda item: (item[2] / max_font) * 0.55
                    + max(0, 1 - abs(item[1] - target_y) / max(height * 0.35, 1)) * 0.30
                    + min(len(_compact(item[0])) / 30, 1) * 0.15, reverse=True)
    return candidates[0][0][:100]


def _source_url(url: str, platform: str, site_domain: str) -> str | None:
    parsed = urlparse(url)
    host = (parsed.hostname or "").casefold()
    if parsed.scheme != "https" or parsed.username or parsed.password:
        return None
    if platform in PLATFORMS:
        domain, path_pattern = PLATFORMS[platform]
        if platform == "twitter" and host in {"twitter.com", "www.twitter.com", "mobile.twitter.com"}:
            host = "x.com"
            url = parsed._replace(netloc="x.com").geturl()
        if host != domain and not host.endswith("." + domain):
            return None
        return url if re.search(path_pattern, parsed.path + ("?" + parsed.query if parsed.query else ""), re.I) else None
    if platform == "general" and site_domain:
        domain = site_domain.casefold().removeprefix("www.")
        if not re.fullmatch(r"(?:[a-z0-9-]+\.)+[a-z]{2,}", domain):
            return None
        if host != domain and not host.endswith("." + domain):
            return None
        if len(parsed.path.strip("/")) < 5 or re.search(r"/(?:search|login|signin|tag|category)(?:/|$)", parsed.path, re.I):
            return None
        return url
    return None


def _platform_from_ocr(text: str) -> str:
    lower = text.casefold()
    for platform, markers in MARKERS.items():
        if any(marker in lower for marker in markers):
            return platform
    return ""


def _known_domain(text: str) -> str:
    """Use the 155-site catalog for OCR-visible website fingerprints."""
    domains = sorted(DOMAIN_TO_PLATFORM_KEY, key=len, reverse=True)
    lower = text.casefold()
    for domain in domains:
        if re.search(rf"(?<![\w.-])(?:[\w-]+\.)?{re.escape(domain)}(?![\w.-])", lower):
            return domain
    return ""


def _search_queries(domain: str, title: str, author: str, clues: dict | None) -> list[str]:
    """Turn visual fields into a site-specific search fingerprint."""
    base = f'site:{domain} "{title[:80]}"'
    queries = [base]
    if clues:
        distinctive = str(clues.get("distinctive_text") or "")[:40].strip()
        if platform_safe_phrase(distinctive):
            queries.append(f'{base} "{distinctive}"')
    return list(dict.fromkeys(queries))[:2]


def platform_safe_phrase(value: str) -> bool:
    return 6 <= len(_compact(value)) <= 40 and not re.search(r"https?://|site:", value, re.I)


def recover_extended_link(image_bytes: bytes, ocr: dict, clues: dict | None | object = _UNSET) -> str | None:
    """Search only a detected site, accepting a specific page with a matching title."""
    text = str(ocr.get("text") or "")
    short_video = re.search(r"(?:youtu\.be/)([A-Za-z0-9_-]{11})\b", text, re.I)
    if short_video:
        return f"https://www.youtube.com/watch?v={short_video.group(1)}"
    for direct_platform, (direct_domain, _) in PLATFORMS.items():
        pattern = rf"(?:https?://)?(?:[\w.-]+\.)?{re.escape(direct_domain)}/[^\s<>\"']+"
        for match in re.finditer(pattern, text, re.I):
            direct = match.group(0).rstrip("，。,.!?！?；;：:)]}>")
            if not direct.startswith(("http://", "https://")):
                direct = "https://" + direct
            url = _source_url(direct, direct_platform, "")
            if url:
                return url
    for match in re.finditer(r"https?://[^\s<>\"']+", text, re.I):
        direct = match.group(0).rstrip("，。,.!?！?；;：:)]}>")
        host = (urlparse(direct).hostname or "").casefold()
        known = next((domain for domain in DOMAIN_TO_PLATFORM_KEY
                      if host == domain or host.endswith("." + domain)), "")
        if known and _source_url(direct, "general", known):
            return direct
    if clues is _UNSET:
        clues = extract_visual_clues(image_bytes)
    platform = str(clues.get("platform") or "").casefold() if clues else ""
    site_domain = str(clues.get("site_domain") or "") if clues else ""
    if ("写留言" in text and "在看" in text) or "mp.weixin.qq.com" in text:
        platform, site_domain = "wechat", "mp.weixin.qq.com"
    if platform not in PLATFORMS and platform != "general":
        platform = _platform_from_ocr(text) or ("general" if site_domain else "")
    if not platform:
        platform = "general" if _known_domain(text) else ""
    if platform == "general" and not site_domain:
        site_domain = _known_domain(text)
    if not platform:
        return None

    if platform == "bilibili":
        # Bilibili has two verified native searches. Do not fall through to
        # generic/Bing searches, which duplicate work until the UI times out.
        page_clues = _page_clues(ocr)
        title = (str(clues.get("title") or "").strip() if clues else "")
        title = title or (page_clues[0] if page_clues else "")
        author = (str(clues.get("author") or "").strip() if clues else "")
        if len(_compact(title)) >= 10:
            proxy = detect_local_proxy()
            proxies = {"http": proxy, "https": proxy} if proxy else None
            found_id = str(clues.get("id") or "").strip() if clues else ""
            imported = recover_imported_link(platform, title, author, text,
                                             "bilibili.com", proxies, found_id)
            if imported and _source_url(imported, platform, ""):
                return imported
        return recover_bilibili_video(ocr)

    layout = extract_layout_clues(ocr) if ocr.get("lines") else {}
    title = str(clues.get("title") or "").strip() if clues else ""
    title = title or str(layout.get("title") or "").strip() or _ocr_title(ocr)
    needle = _compact(title)
    if len(needle) < 10:
        return None
    domain = PLATFORMS[platform][0] if platform in PLATFORMS else site_domain
    if not domain:
        return None

    proxy = detect_local_proxy()
    proxies = {"http": proxy, "https": proxy} if proxy else None
    author = str(clues.get("author") or "").strip() if clues else ""
    author = author or str(layout.get("author") or "").strip()
    specialized = recover_platform_link(platform, title, author, proxies)
    if specialized and _source_url(specialized, platform, site_domain):
        return specialized
    found_id = str(clues.get("id") or "").strip() if clues else ""
    if found_id in {"1024567", "123456", "1024", "12345", "10001"}:
        found_id = ""
    imported = recover_imported_link(platform, title, author, text, domain, proxies, found_id)
    if imported and _source_url(imported, platform, site_domain):
        return imported
    for query in _search_queries(domain, title, author, clues):
        try:
            response = requests.get("https://www.bing.com/search",
                                    params={"q": query}, headers={"User-Agent": "Mozilla/5.0"},
                                    proxies=proxies, timeout=6)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            for result in soup.select("li.b_algo")[:6]:
                anchor = result.select_one("h2 a[href]")
                if not anchor:
                    continue
                url = _source_url(anchor.get("href", ""), platform, site_domain)
                candidate = _compact(anchor.get_text(" ", strip=True))
                if url and candidate and SequenceMatcher(None, needle, candidate, autojunk=False).ratio() >= 0.82:
                    return url
        except requests.RequestException:
            continue
    return None
