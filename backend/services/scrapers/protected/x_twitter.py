# ==============================================================================
# RULE ID: P-005 | X.com / Twitter
# STATUS: 🔒 PROTECTED (Verified & locked rule, approved OK by user)
# ==============================================================================

import re
from typing import Optional
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
from backend.services.scrapers.base import BaseScraper, ScrapedMetadata
from backend.services.screenshot_service import detect_local_proxy

BOT_HEADERS = {
    "User-Agent": "Twitterbot/1.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

STATUS_REGEX = re.compile(
    r'(?:twitter\.com|x\.com)/(?:([a-zA-Z0-9_]+)/status(?:es)?/|i/(?:web/)?status/)(\d+)',
    re.IGNORECASE
)

PROFILE_REGEX = re.compile(
    r'(?:twitter\.com|x\.com)/([a-zA-Z0-9_]+)/?$',
    re.IGNORECASE
)

TWITTER_FAVICON = "https://abs.twimg.com/favicons/twitter.3.ico"
DEFAULT_PLACEHOLDER = "https://abs.twimg.com/rweb/ssr/default/v2/og/image.png"

class XTwitterScraper(BaseScraper):
    name = "x_twitter"
    status = "PROTECTED"

    def can_handle(self, url: str) -> bool:
        lower = url.lower()
        return "twitter.com" in lower or "x.com" in lower

    def scrape(self, url: str) -> Optional[ScrapedMetadata]:
        proxy = detect_local_proxy()
        proxies = {"http": proxy, "https": proxy} if proxy else None

        clean_url = url.split("?")[0].split("#")[0].rstrip("/")
        status_match = STATUS_REGEX.search(clean_url)

        # Case 1: Post / Tweet / Status URL
        if status_match:
            username = status_match.group(1) or "i"
            status_id = status_match.group(2)

            # Strategy 1.1: FxTwitter Open API (High reliability & rich metadata)
            fx_url = f"https://api.fxtwitter.com/{username}/status/{status_id}"
            try:
                r = requests.get(fx_url, proxies=proxies, timeout=8)
                if r.status_code == 200:
                    data = r.json()
                    tweet = data.get("tweet", {})
                    if tweet:
                        author_name = tweet.get("author", {}).get("name") or username
                        screen_name = tweet.get("author", {}).get("screen_name") or username
                        text = tweet.get("text", "").strip()
                        article = tweet.get("article") or {}
                        article_title = (article.get("title") or "").strip()
                        article_preview = (article.get("preview_text") or "").strip()

                        # Article cover -> native media -> linked-page card preview.
                        cover_info = (article.get("cover_media") or {}).get("media_info") or {}
                        image = cover_info.get("original_img_url") or ""
                        media = tweet.get("media", {})
                        if not image and media:
                            mosaic = media.get("mosaic", {}).get("formats", {}).get("jpeg")
                            photos = media.get("photos", [])
                            videos = media.get("videos", [])
                            if mosaic:
                                image = mosaic
                            elif photos and photos[0].get("url"):
                                image = photos[0].get("url")
                            elif videos and videos[0].get("thumbnail_url"):
                                image = videos[0].get("thumbnail_url")

                        if not image:
                            card = tweet.get("card")
                            card = card if isinstance(card, dict) else {}
                            card_image = card.get("image") or {}
                            image = card_image.get("url") if isinstance(card_image, dict) else card_image
                            image = image or ""

                        # Build descriptive title with author AND post text
                        clean_text = " ".join(text.split())
                        if article_title:
                            title = f"{author_name}: “{article_title}”"
                        elif clean_text:
                            short_text = clean_text[:70] + "..." if len(clean_text) > 70 else clean_text
                            title = f"{author_name}: “{short_text}”"
                        else:
                            title = f"{author_name} (@{screen_name}) 的 X 动态"

                        return {
                            "title": title,
                            "description": article_preview or text,
                            "image": image,
                            "favicon": TWITTER_FAVICON,
                            "url": url,
                        }
            except Exception as e:
                print(f"[XTwitterScraper] FxTwitter extraction failed: {e}")

            # Strategy 1.2: Direct Twitterbot SSR Scrape Fallback
            try:
                r = requests.get(url, headers=BOT_HEADERS, proxies=proxies, timeout=8)
                if r.status_code == 200:
                    soup = BeautifulSoup(r.text, "html.parser")
                    og_title = soup.find("meta", property="og:title")
                    og_desc = soup.find("meta", property="og:description")
                    og_image = soup.find("meta", property="og:image")
                    tw_image = soup.find("meta", attrs={"name": "twitter:image"})

                    raw_title = og_title.get("content", "").strip() if og_title else ""
                    raw_desc = og_desc.get("content", "").strip() if og_desc else ""
                    raw_img = (og_image.get("content", "").strip() if og_image else "") or \
                              (tw_image.get("content", "").strip() if tw_image else "")

                    # Extract author from "Author (@handle) on X"
                    author = re.sub(r'\s+on\s+(?:X|Twitter).*$', '', raw_title, flags=re.IGNORECASE).strip()
                    author = author or username

                    clean_desc = " ".join(raw_desc.split())
                    if clean_desc:
                        short_text = clean_desc[:70] + "..." if len(clean_desc) > 70 else clean_desc
                        title = f"{author}: “{short_text}”"
                    elif author:
                        title = f"{author} 的 X 动态"
                    else:
                        title = "X (Twitter) 动态"

                    image = raw_img if raw_img and DEFAULT_PLACEHOLDER not in raw_img else ""

                    return {
                        "title": title,
                        "description": raw_desc,
                        "image": image,
                        "favicon": TWITTER_FAVICON,
                        "url": url,
                    }
            except Exception as e:
                print(f"[XTwitterScraper] SSR fallback failed: {e}")

        # Case 2: Profile URL or other X URLs
        try:
            r = requests.get(url, headers=BOT_HEADERS, proxies=proxies, timeout=8)
            if r.status_code == 200:
                soup = BeautifulSoup(r.text, "html.parser")
                og_title = soup.find("meta", property="og:title")
                og_desc = soup.find("meta", property="og:description")
                og_image = soup.find("meta", property="og:image")

                raw_title = og_title.get("content", "").strip() if og_title else ""
                raw_desc = og_desc.get("content", "").strip() if og_desc else ""
                raw_img = og_image.get("content", "").strip() if og_image else ""

                author = re.sub(r'\s+on\s+(?:X|Twitter).*$', '', raw_title, flags=re.IGNORECASE).strip()
                title = f"{author} 的 X 个人主页" if author else (raw_title or url)

                return {
                    "title": title,
                    "description": raw_desc,
                    "image": raw_img if DEFAULT_PLACEHOLDER not in raw_img else "",
                    "favicon": TWITTER_FAVICON,
                    "url": url,
                }
        except Exception as e:
            print(f"[XTwitterScraper] Profile scrape failed: {e}")

        return None
