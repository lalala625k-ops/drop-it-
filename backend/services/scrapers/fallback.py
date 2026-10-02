# ==============================================================================
# RULE ID: G-001 | Generic OpenGraph & Headless Screenshot Fallback
# STATUS: 🌐 LOCKED GENERIC BASELINE (site-specific exceptions run first)
# ==============================================================================

from typing import Optional
import ipaddress
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup
from backend.services.scrapers.base import BaseScraper, ScrapedMetadata
from backend.services.screenshot_service import capture_screenshot_fallback, detect_local_proxy, is_auth_url

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

class GenericFallbackScraper(BaseScraper):
    name = "generic_fallback"
    status = "FALLBACK"

    def can_handle(self, url: str) -> bool:
        # Handles any URL as the final safety net
        return True

    def scrape(self, url: str) -> Optional[ScrapedMetadata]:
        try:
            hostname = urlparse(url).hostname or ""
            try:
                is_local = not ipaddress.ip_address(hostname).is_global
            except ValueError:
                is_local = hostname == "localhost" or hostname.endswith(".local")
            proxy = None if is_local else detect_local_proxy()
            proxies = {"http": proxy, "https": proxy} if proxy else None
            resp = requests.get(url, headers=HEADERS, proxies=proxies, timeout=8, allow_redirects=True)
            resp.encoding = resp.apparent_encoding or "utf-8"
            html = resp.text
            soup = BeautifulSoup(html, "html.parser")

            title = ""
            description = ""
            image = ""
            favicon = ""

            # 1. Title
            for prop in ["og:title", "twitter:title"]:
                tag = soup.find("meta", attrs={"property": prop}) or soup.find("meta", attrs={"name": prop})
                if tag and tag.get("content"):
                    title = tag["content"].strip()
                    break
            if not title and soup.title and soup.title.string:
                title = soup.title.string.strip()

            # 2. Cover image
            for prop in ["og:image", "twitter:image"]:
                tag = soup.find("meta", attrs={"property": prop}) or soup.find("meta", attrs={"name": prop})
                if tag and tag.get("content"):
                    image = urljoin(resp.url, tag["content"].strip())
                    break

            # 3. Description
            for prop in ["og:description", "twitter:description", "description"]:
                tag = soup.find("meta", attrs={"property": prop}) or soup.find("meta", attrs={"name": prop})
                if tag and tag.get("content"):
                    description = tag["content"].strip()
                    break

            # 4. Favicon
            icon_tag = soup.find("link", rel=lambda x: x and any(k in x.lower() for k in ["icon", "shortcut icon"]))
            if icon_tag and icon_tag.get("href"):
                favicon = urljoin(resp.url, icon_tag["href"].strip())
            else:
                parsed = urlparse(resp.url)
                favicon = f"{parsed.scheme}://{parsed.netloc}/favicon.ico"

            # 5. Headless screenshot fallback if image is missing (only for non-auth pages)
            if not image and not is_auth_url(resp.url or url):
                fallback_img = capture_screenshot_fallback(resp.url or url)
                if fallback_img:
                    image = fallback_img

            return {
                "title": title or url,
                "description": description,
                "image": image,
                "favicon": favicon,
                "url": resp.url,
            }
        except Exception as e:
            print(f"[Fallback Scraper] Scrape error for {url}: {e}")
            fallback_img = None
            if not is_auth_url(url):
                fallback_img = capture_screenshot_fallback(url)
            return {
                "title": url,
                "description": "",
                "image": fallback_img or "",
                "favicon": "",
                "url": url,
            }
