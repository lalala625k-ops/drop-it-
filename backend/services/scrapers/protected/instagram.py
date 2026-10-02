# ==============================================================================
# RULE ID: P-002 | Instagram
# STATUS: 🔒 PROTECTED (LOCKED - DO NOT MODIFY WITHOUT EXPLICIT USER INSTRUCTION)
# APPROVED: 2026-09-21 (User Confirmed OK)
# ==============================================================================

import re
from typing import Optional
import requests
from bs4 import BeautifulSoup
from backend.services.scrapers.base import BaseScraper, ScrapedMetadata
from backend.services.screenshot_service import detect_local_proxy

IG_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
}

class InstagramScraper(BaseScraper):
    name = "instagram"
    status = "PROTECTED"

    def can_handle(self, url: str) -> bool:
        lower = url.lower()
        return "instagram.com" in lower or "instagr.am" in lower

    def scrape(self, url: str) -> Optional[ScrapedMetadata]:
        proxy = detect_local_proxy()
        proxies = {"http": proxy, "https": proxy} if proxy else None
        shortcode_match = re.search(r'/(?:p|reel|tv)/([a-zA-Z0-9_-]+)', url)
        if shortcode_match:
            shortcode = shortcode_match.group(1)
            embed_url = f"https://www.instagram.com/p/{shortcode}/embed/captioned/"
            try:
                # Clean User-Agent without Accept-Language ensures Instagram delivers pre-rendered server HTML
                r = requests.get(embed_url, headers=IG_HEADERS, proxies=proxies, timeout=8)
                if r.status_code == 200:
                    soup = BeautifulSoup(r.text, "html.parser")
                    img = soup.find("img", class_="EmbeddedMediaImage")
                    if not img:
                        for im in soup.find_all("img"):
                            src = im.get("src", "")
                            if "cdninstagram" in src or "fbcdn" in src:
                                img = im
                                break

                    if img and img.get("src"):
                        caption_el = soup.find(class_="Caption")
                        username_el = soup.find(class_="Username")

                        author = username_el.get_text(strip=True) if username_el else ""
                        author = re.sub(r'(?:已验证|Verified|\s+)', ' ', author).strip()

                        desc = caption_el.get_text(strip=True) if caption_el else ""
                        if author and desc.startswith(author):
                            desc = desc[len(author):].strip()

                        if author and desc:
                            short_desc = desc[:60] + "..." if len(desc) > 60 else desc
                            title = f"{author} 在 Instagram: “{short_desc}”"
                        elif author:
                            title = f"{author} 的 Instagram 内容"
                        else:
                            title = "Instagram 动态"

                        return {
                            "title": title,
                            "description": desc,
                            "image": img["src"],
                            "favicon": "https://www.instagram.com/favicon.ico",
                            "url": url,
                        }
            except Exception as e:
                print(f"[Protected Instagram] Embed extraction error: {e}")

        # Fallback for Profile or other IG URLs
        try:
            r = requests.get(url, headers=IG_HEADERS, proxies=proxies, timeout=8)
            if r.status_code == 200:
                soup = BeautifulSoup(r.text, "html.parser")
                og_img = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"})
                og_title = soup.find("meta", property="og:title") or soup.find("meta", attrs={"name": "og:title"})
                og_desc = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "og:description"})

                title = og_title.get("content", "").strip() if og_title else ""
                image = og_img.get("content", "").strip() if og_img else ""
                desc = og_desc.get("content", "").strip() if og_desc else ""

                if image or (title and title != "Instagram"):
                    return {
                        "title": title or "Instagram",
                        "description": desc,
                        "image": image,
                        "favicon": "https://www.instagram.com/favicon.ico",
                        "url": url,
                    }
        except Exception as e:
            print(f"[Protected Instagram] Profile extraction error: {e}")

        return None
