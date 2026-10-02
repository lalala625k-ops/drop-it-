# ==============================================================================
# RULE ID: P-001 | Bilibili (哔哩哔哩)
# STATUS: 🔒 PROTECTED (LOCKED - DO NOT MODIFY WITHOUT EXPLICIT USER INSTRUCTION)
# APPROVED: 2026-09-20 (User Confirmed OK)
# ==============================================================================

import re
from typing import Optional
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup
from backend.services.scrapers.base import BaseScraper, ScrapedMetadata
from backend.services.screenshot_service import detect_local_proxy

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

class BilibiliScraper(BaseScraper):
    name = "bilibili"
    status = "PROTECTED"

    def can_handle(self, url: str) -> bool:
        lower = url.lower()
        return "bilibili.com" in lower or "b23.tv" in lower

    def scrape(self, url: str) -> Optional[ScrapedMetadata]:
        proxy = detect_local_proxy()
        proxies = {"http": proxy, "https": proxy} if proxy else None
        is_short_link = urlparse(url).hostname == 'b23.tv'
        bv_match = re.search(r'(BV[a-zA-Z0-9]+)', url, re.IGNORECASE)
        av_match = re.search(r'av(\d+)', url, re.IGNORECASE)
        bvid = bv_match.group(1) if bv_match else None
        aid = av_match.group(1) if av_match else None

        if is_short_link:
            try:
                r = requests.head(url, headers=HEADERS, proxies=proxies, allow_redirects=True, timeout=5)
                if urlparse(r.url).hostname == 'b23.tv':
                    r = requests.get(url, headers=HEADERS, proxies=proxies, allow_redirects=True, timeout=5)
                url = r.url
                bv_match = re.search(r'(BV[a-zA-Z0-9]+)', url, re.IGNORECASE)
                if bv_match:
                    bvid = bv_match.group(1)
                av_match = re.search(r'av(\d+)', url, re.IGNORECASE)
                if av_match:
                    aid = av_match.group(1)
            except Exception:
                pass

        # 1. Video metadata via official web API
        if bvid or aid:
            api_url = f"https://api.bilibili.com/x/web-interface/view?{'bvid=' + bvid if bvid else 'aid=' + aid}"
            try:
                r = requests.get(api_url, headers={**HEADERS, "Referer": "https://www.bilibili.com/"}, proxies=proxies, timeout=6)
                data = r.json()
                if data.get("code") == 0:
                    d = data.get("data", {})
                    pic = d.get("pic", "")
                    if pic.startswith("//"):
                        pic = "https:" + pic
                    elif pic.startswith("http://"):
                        pic = "https://" + pic[7:]
                    return {
                        "title": d.get("title", ""),
                        "description": d.get("desc", ""),
                        "image": pic,
                        "favicon": "https://www.bilibili.com/favicon.ico",
                        "url": url,
                    }
            except Exception as e:
                print(f"[Protected Bilibili] Video API error: {e}")

            # The public video page may still expose the original title and cover
            # when the JSON API rejects this request.
            page_title = ""
            page_description = ""
            try:
                r = requests.get(url, headers={**HEADERS, "Referer": "https://www.bilibili.com/"}, proxies=proxies, timeout=8)
                soup = BeautifulSoup(r.text, "html.parser")
                title_tag = soup.find("meta", property="og:title")
                image_tag = soup.find("meta", property="og:image")
                desc_tag = soup.find("meta", property="og:description")
                page_title = title_tag.get("content", "").strip() if title_tag else ""
                page_description = desc_tag.get("content", "").strip() if desc_tag else ""
                image = urljoin(r.url, image_tag.get("content", "").strip()) if image_tag else ""
                image_url = urlparse(image)
                if image_url.hostname and image_url.hostname.endswith('hdslb.com') and '/bfs/archive/' in image_url.path:
                    return {
                        "title": page_title,
                        "description": page_description,
                        "image": image.replace('http://', 'https://', 1),
                        "favicon": "https://www.bilibili.com/favicon.ico",
                        "url": url,
                    }
            except Exception as e:
                print(f"[Protected Bilibili] Video page error: {e}")

            # Keep a video link out of the generic screenshot fallback.
            return {"title": page_title, "description": page_description, "image": "", "favicon": "https://www.bilibili.com/favicon.ico", "url": url}

        # 2. Creator space metadata via masterpiece API
        space_match = re.search(r'space\.bilibili\.com/(\d+)', url)
        if space_match:
            mid = space_match.group(1)
            try:
                r = requests.get(
                    f"https://api.bilibili.com/x/space/masterpiece?vmid={mid}",
                    headers={**HEADERS, "Referer": "https://space.bilibili.com"},
                    proxies=proxies,
                    timeout=6
                )
                data = r.json()
                if data.get("code") == 0 and data.get("data"):
                    items = data.get("data", [])
                    if items:
                        first = items[0]
                        pic = first.get("pic", "")
                        if pic.startswith("//"):
                            pic = "https:" + pic
                        elif pic.startswith("http://"):
                            pic = "https://" + pic[7:]
                        owner = first.get("owner", {})
                        return {
                            "title": f"{owner.get('name', 'UP主')} 的个人空间 - 哔哩哔哩",
                            "description": first.get("desc", ""),
                            "image": pic,
                            "favicon": "https://www.bilibili.com/favicon.ico",
                            "url": url,
                        }
            except Exception as e:
                print(f"[Protected Bilibili] Space API error: {e}")

            return {"title": "UP主个人空间 - 哔哩哔哩", "description": "", "image": "", "favicon": "https://www.bilibili.com/favicon.ico", "url": url}

        if is_short_link:
            return {"title": "", "description": "", "image": "", "favicon": "https://www.bilibili.com/favicon.ico", "url": url}

        return None
