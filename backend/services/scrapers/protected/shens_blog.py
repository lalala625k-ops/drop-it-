# ==============================================================================
# RULE ID: P-007 | Shen's Blog
# STATUS: 🔒 PROTECTED (LOCKED - DO NOT MODIFY WITHOUT EXPLICIT USER INSTRUCTION)
# ==============================================================================

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


def meta_content(soup: BeautifulSoup, *names: str) -> str:
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
        if tag and tag.get("content"):
            return tag["content"].strip()
    return ""


class ShensBlogScraper(BaseScraper):
    name = "shens_blog"
    status = "PROTECTED"

    def can_handle(self, url: str) -> bool:
        host = (urlparse(url).hostname or "").lower()
        return host in ("shens.blog", "www.shens.blog")

    def scrape(self, url: str) -> Optional[ScrapedMetadata]:
        try:
            proxy = detect_local_proxy()
            proxies = {"http": proxy, "https": proxy} if proxy else None
            response = requests.get(url, headers=HEADERS, proxies=proxies, timeout=8, allow_redirects=True)
            response.raise_for_status()
            response.encoding = response.apparent_encoding or "utf-8"
            soup = BeautifulSoup(response.text, "html.parser")

            title = meta_content(soup, "og:title", "twitter:title")
            if not title and soup.title:
                title = soup.title.get_text(strip=True)
            image = meta_content(soup, "og:image", "twitter:image")
            description = meta_content(soup, "og:description", "twitter:description", "description")
            icon = soup.find("link", rel=lambda value: value and any(
                "icon" in item.lower() for item in (value if isinstance(value, list) else [value])
            ))
            favicon = urljoin(response.url, icon["href"].strip()) if icon and icon.get("href") else urljoin(response.url, "/favicon.ico")

            return {
                "title": title or url,
                "description": description,
                "image": urljoin(response.url, image) if image else "",
                "favicon": favicon,
                "url": response.url,
            }
        except Exception as error:
            print(f"[Protected Shen's Blog] Request error: {error}")
            return {"title": url, "description": "", "image": "", "favicon": "", "url": url}
