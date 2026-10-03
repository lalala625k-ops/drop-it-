import re
import urllib.parse
from typing import Optional, Dict, Any, List
import requests
from bs4 import BeautifulSoup
from .base import PlatformResult

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
}

class ZhihuResolver:
    """
    Dedicated resolver for Zhihu questions, answers, and column articles.
    Resolves directly to the original Zhihu post URL (e.g. zhuanlan.zhihu.com/p/... or zhihu.com/question/...)
    instead of just dropping the user into the search bar.
    """

    def extract_direct_url(self, text: str) -> Optional[str]:
        # Match zhuanlan article or question/answer URL in text
        m = re.search(r'https?://(?:www\.|zhuanlan\.)?zhihu\.com/(?:p|question)/[0-9]+(?:/answer/[0-9]+)?', text)
        if m:
            return m.group(0)
        return None

    def search_exact_post(self, title: str, author: Optional[str] = None) -> Optional[str]:
        clean_title = title.strip()
        # Remove brackets or clean punctuation for queries
        core_title = re.sub(r'^[【\[\(](.*?)[】\]\)]', r'\1 ', clean_title).strip()
        
        queries = [
            f'site:zhihu.com "{clean_title}"',
            f'site:zhihu.com {clean_title}',
            f'{clean_title} 知乎'
        ]
        if author:
            queries.insert(1, f'site:zhihu.com "{clean_title}" {author}')

        zhihu_pattern = re.compile(r'https?://(?:www\.|zhuanlan\.)?zhihu\.com/(?:p|question)/[0-9]+(?:/answer/[0-9]+)?', re.IGNORECASE)

        for q in queries:
            url = "https://www.sogou.com/web?query=" + urllib.parse.quote(q)
            try:
                r = requests.get(url, headers=HEADERS, timeout=3.5)
                soup = BeautifulSoup(r.text, 'html.parser')
                for h3 in soup.find_all('h3')[:6]:
                    a = h3.find('a')
                    if not a or not a.get('href'):
                        continue
                    href = a['href']
                    if href.startswith('/link?url='):
                        link_url = "https://www.sogou.com" + href
                        r_link = requests.get(link_url, headers=HEADERS, timeout=2.5)
                        match = zhihu_pattern.search(r_link.text)
                        if match:
                            found_url = match.group(0)
                            return found_url
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
                platform="zhihu",
                platform_name="知乎 (Zhihu)",
                title=title or "知乎帖子",
                url=direct_url,
                author=author,
                confidence=0.99,
                matched_method="zhihu_url_direct",
                extra_urls=[
                    {"name": "⚡ 立即打开知乎原帖", "url": direct_url}
                ],
                raw_details={"domain": "zhihu.com", "title": title, "author": author, "is_direct_url": True}
            )

        # 2. Check explicit Question or Article ID
        if found_id and found_id.isdigit():
            fid = found_id.strip()
            # If length is around 9 digits, usually article or question
            primary_url = f"https://www.zhihu.com/question/{fid}"
            return PlatformResult(
                platform="zhihu",
                platform_name="知乎 (Zhihu)",
                title=title or f"知乎问题 #{fid}",
                url=primary_url,
                author=author,
                confidence=0.98,
                matched_method="zhihu_id_direct",
                extra_urls=[
                    {"name": "⚡ 打开该知乎问题", "url": primary_url}
                ],
                raw_details={"domain": "zhihu.com", "id": fid, "is_direct_url": True}
            )

        clean_title = (title or text or "").strip()
        if not clean_title:
            clean_title = "知乎"

        # 3. Active Real-time Reverse Lookup for original post URL
        exact_url = self.search_exact_post(clean_title, author=author)
        if exact_url:
            return PlatformResult(
                platform="zhihu",
                platform_name="知乎 (Zhihu)",
                title=clean_title,
                url=exact_url,
                author=author,
                confidence=0.98,
                matched_method="zhihu_exact_post_direct",
                extra_urls=[
                    {"name": "⚡ 立即打开知乎原帖 (原网页)", "url": exact_url},
                    {"name": "在知乎站内搜索", "url": f"https://www.zhihu.com/search?type=content&q={urllib.parse.quote(clean_title)}"},
                    {"name": "Google 定向反查", "url": f"https://www.google.com/search?q={urllib.parse.quote(f'site:zhihu.com {clean_title}')}"}
                ],
                raw_details={
                    "domain": "zhihu.com",
                    "title": clean_title,
                    "author": author,
                    "is_direct_url": True,
                    "discovered_via": "sogou_zhihu_index"
                }
            )

        # 4. Fallback if no exact post indexed
        fallback_search = f"https://www.zhihu.com/search?type=content&q={urllib.parse.quote(clean_title)}"
        return PlatformResult(
            platform="zhihu",
            platform_name="知乎 (Zhihu)",
            title=clean_title,
            url=fallback_search,
            author=author,
            confidence=0.88,
            matched_method="zhihu_search_fallback",
            extra_urls=[
                {"name": "在知乎搜索该内容", "url": fallback_search},
                {"name": "🚀 Google 原站直达 (手气不错)", "url": f"https://www.google.com/search?q={urllib.parse.quote(f'site:zhihu.com {clean_title}')}&btnI=1"},
                {"name": "Bing 定向反查", "url": f"https://www.bing.com/search?q={urllib.parse.quote(f'site:zhihu.com {clean_title}')}"}
            ],
            raw_details={
                "domain": "zhihu.com",
                "title": clean_title,
                "author": author,
                "is_direct_url": False
            }
        )
