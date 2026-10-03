"""Medium metadata without treating access challenges as article previews."""

import re
from typing import Optional
from urllib.parse import unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from backend.services.scrapers.base import BaseScraper, ScrapedMetadata
from backend.services.screenshot_service import detect_local_proxy


HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
}
BLOCKED_TITLES = ("just a moment", "sorry, you have been blocked", "access denied")


def _fallback_title(url: str) -> str:
    slug = unquote(urlparse(url).path.rstrip("/").split("/")[-1])
    slug = re.sub(r"-[0-9a-f]{12}$", "", slug, flags=re.IGNORECASE)
    words = slug.replace("-", " ").replace("_", " ").strip()
    if not words or words.startswith("@"):
        return "Medium 文章"
    return re.sub(r"\bai\b", "AI", words.title(), flags=re.IGNORECASE)


def _meta(soup: BeautifulSoup, name: str) -> str:
    tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
    return str(tag.get("content", "")).strip() if tag else ""


class MediumScraper(BaseScraper):
    name = "medium"
    status = "EXPERIMENTAL"

    def can_handle(self, url: str) -> bool:
        host = (urlparse(url).hostname or "").lower()
        return host == "medium.com" or host.endswith(".medium.com")

    def scrape(self, url: str) -> Optional[ScrapedMetadata]:
        title = _fallback_title(url)
        description = ""
        image = ""
        try:
            proxy = detect_local_proxy()
            proxies = {"http": proxy, "https": proxy} if proxy else None
            response = requests.get(url, headers=HEADERS, proxies=proxies, timeout=8)
            if response.ok:
                soup = BeautifulSoup(response.text, "html.parser")
                page_title = _meta(soup, "og:title") or _meta(soup, "twitter:title")
                if not page_title and soup.title:
                    page_title = soup.title.get_text(strip=True)
                page_text = soup.get_text(" ", strip=True).lower()[:2000]
                blocked = any(marker in page_title.lower() or marker in page_text for marker in BLOCKED_TITLES)
                if not blocked:
                    title = page_title or title
                    description = _meta(soup, "og:description") or _meta(soup, "description")
                    cover = _meta(soup, "og:image") or _meta(soup, "twitter:image")
                    image = urljoin(response.url, cover) if cover else ""
        except requests.RequestException as error:
            print(f"[Experimental Medium] Request error: {error}")

        return {
            "title": title,
            "description": description,
            "image": image,
            "favicon": "https://medium.com/favicon.ico",
            "url": url,
        }
