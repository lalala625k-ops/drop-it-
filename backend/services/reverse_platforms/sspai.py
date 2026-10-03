import re
import urllib.parse
from typing import Optional, Dict, Any, List
import requests
import difflib
from .base import PlatformResult

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Referer": "https://sspai.com/",
    "Accept": "application/json, text/plain, */*"
}

class SspaiResolver:
    """
    Dedicated resolver for 少数派 (Sspai) articles and columns.
    Resolves directly to the exact post URL (https://sspai.com/post/{id})
    instead of dropping the user into broken search pages (https://sspai.com/search/post/... -> 404).
    """

    def extract_direct_url(self, text: str) -> Optional[str]:
        m = re.search(r'https?://sspai\.com/post/([0-9]+)', text)
        if m:
            return m.group(0)
        return None

    def search_exact_post(self, title: str, author: Optional[str] = None) -> Optional[str]:
        if not title:
            return None
        clean_title = re.sub(r'[\r\n\t]', ' ', title).strip()
        segments = [s.strip() for s in re.split(r'[:：,，_—\-]+', clean_title) if len(s.strip()) >= 2]
        
        keywords = []
        if segments:
            keywords.append(segments[0])
            if len(segments) > 1:
                keywords.append(segments[1])
        keywords.append(clean_title[:30])

        seen = set()
        for kw in keywords:
            if kw in seen or len(kw) < 2:
                continue
            seen.add(kw)
            url = f"https://sspai.com/api/v1/search?keyword={urllib.parse.quote(kw)}&type=article&limit=10&offset=0"
            try:
                r = requests.get(url, headers=HEADERS, timeout=4)
                if r.status_code == 200:
                    data = r.json()
                    items = data.get('data') or data.get('list') or []
                    best_match_id = None
                    best_score = 0.0

                    for item in items:
                        item_id = item.get('id')
                        item_title = item.get('title', '')
                        item_author = (item.get('author') or {}).get('nickname', '')

                        # Similarity score
                        sim = difflib.SequenceMatcher(None, clean_title.lower(), item_title.lower()).ratio()
                        if author and author.lower() in item_author.lower():
                            sim += 0.25
                        if any(seg.lower() in item_title.lower() for seg in segments):
                            sim += 0.35

                        if sim > best_score:
                            best_score = sim
                            best_match_id = item_id

                    if best_match_id and best_score >= 0.40:
                        return f"https://sspai.com/post/{best_match_id}"
            except Exception:
                pass

        return None

    def resolve(
        self,
        text: str,
        title: Optional[str] = None,
        author: Optional[str] = None,
        found_id: Optional[str] = None
    ) -> PlatformResult:
        # 1. Direct URL in text
        direct_url = self.extract_direct_url(text) if text else None
        if direct_url:
            return PlatformResult(
                platform="sspai",
                platform_name="少数派 (sspai)",
                title=title or "少数派文章",
                url=direct_url,
                author=author,
                confidence=0.99,
                matched_method="sspai_url_direct",
                extra_urls=[
                    {"name": "⚡ 立即打开少数派原帖 (原网页)", "url": direct_url}
                ],
                raw_details={"domain": "sspai.com", "title": title, "author": author, "is_direct_url": True}
            )

        # 2. Check explicit Article ID
        if found_id and str(found_id).strip().isdigit():
            fid = str(found_id).strip()
            primary_url = f"https://sspai.com/post/{fid}"
            return PlatformResult(
                platform="sspai",
                platform_name="少数派 (sspai)",
                title=title or f"少数派文章 #{fid}",
                url=primary_url,
                author=author,
                confidence=0.98,
                matched_method="sspai_id_direct",
                extra_urls=[
                    {"name": "⚡ 立即打开少数派原帖 (原网页)", "url": primary_url}
                ],
                raw_details={"domain": "sspai.com", "id": fid, "is_direct_url": True}
            )

        clean_title = (title or text or "").strip()
        if not clean_title:
            clean_title = "少数派"

        # 3. Active Real-time Reverse Lookup for original post URL
        exact_url = self.search_exact_post(clean_title, author=author)
        if exact_url:
            return PlatformResult(
                platform="sspai",
                platform_name="少数派 (sspai)",
                title=clean_title,
                url=exact_url,
                author=author,
                confidence=0.98,
                matched_method="sspai_post_direct",
                extra_urls=[
                    {"name": "⚡ 立即打开少数派原帖 (原网页)", "url": exact_url},
                    {"name": "在少数派站内搜索", "url": f"https://sspai.com/search?keyword={urllib.parse.quote(clean_title)}"},
                    {"name": "Google 定向反查", "url": f"https://www.google.com/search?q={urllib.parse.quote(f'site:sspai.com {clean_title}')}"}
                ],
                raw_details={
                    "domain": "sspai.com",
                    "title": clean_title,
                    "author": author,
                    "is_direct_url": True,
                    "discovered_via": "sspai_official_api"
                }
            )

        # 4. Fallback if no exact post indexed (NEVER use broken /search/post/ URL)
        fallback_search = f"https://sspai.com/search?keyword={urllib.parse.quote(clean_title)}"
        return PlatformResult(
            platform="sspai",
            platform_name="少数派 (sspai)",
            title=clean_title,
            url=fallback_search,
            author=author,
            confidence=0.88,
            matched_method="sspai_search_fallback",
            extra_urls=[
                {"name": "在少数派搜索该内容", "url": fallback_search},
                {"name": "🚀 Google 原站直达 (手气不错)", "url": f"https://www.google.com/search?q={urllib.parse.quote(f'site:sspai.com {clean_title}')}&btnI=1"},
                {"name": "百度 定向反查", "url": f"https://www.baidu.com/s?wd={urllib.parse.quote(f'site:sspai.com {clean_title}')}"}
            ],
            raw_details={
                "domain": "sspai.com",
                "title": clean_title,
                "author": author,
                "is_direct_url": False
            }
        )
