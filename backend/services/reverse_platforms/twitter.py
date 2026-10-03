import re
from typing import Optional, List, Dict, Any
from urllib.parse import quote
from .base import PlatformResult

class TwitterResolver:
    def extract_handle(self, text: str) -> Optional[str]:
        """Extract @username from text, ignoring emails or invalid characters"""
        matches = re.findall(r'(?<!\w)@([a-zA-Z0-9_]{1,15})\b', text)
        if matches:
            # Filter out common noise handles if any
            for m in matches:
                if len(m) >= 2:
                    return m
        return None

    def extract_status_id(self, text: str) -> Optional[str]:
        """Check for tweet status ID like /status/1234567890123456789 or 19 digits"""
        match = re.search(r'status/(\d{15,22})', text)
        if match:
            return match.group(1)
        return None

    def resolve(self, text: str, handle: Optional[str] = None, status_id: Optional[str] = None) -> Optional[PlatformResult]:
        if not handle:
            handle = self.extract_handle(text)
        if not status_id:
            status_id = self.extract_status_id(text)

        # 1. Exact Tweet ID match
        if handle and status_id:
            url = f"https://x.com/{handle}/status/{status_id}"
            return PlatformResult(
                platform="twitter",
                platform_name="X (Twitter)",
                title=f"@{handle} 的推文 (ID: {status_id})",
                url=url,
                author=f"@{handle}",
                confidence=0.99,
                matched_method="tweet_id_direct",
                extra_urls=[
                    {"name": f"访问 @{handle} 主页", "url": f"https://x.com/{handle}"},
                    {"name": f"在 X 搜索相关内容", "url": f"https://x.com/search?q=from%3A{handle}&f=live"}
                ],
                raw_details={"handle": handle, "status_id": status_id}
            )

        # 2. Handle + Post snippet match
        if handle:
            # Extract main text without the handle itself
            clean_text = text.replace(f"@{handle}", "").strip()
            # Pick first 40 chars of meaningful text as query snippet
            words = [w for w in clean_text.split() if len(w) > 1 and not w.startswith("http")]
            snippet = " ".join(words[:10]) if words else ""
            
            x_search_q = f"from:{handle} {snippet}".strip()
            x_search_url = f"https://x.com/search?q={quote(x_search_q)}&f=live"
            google_search_url = f"https://www.google.com/search?q=site:x.com+from:{handle}+{quote(snippet)}"
            
            profile_url = f"https://x.com/{handle}"
            
            return PlatformResult(
                platform="twitter",
                platform_name="X (Twitter)",
                title=f"@{handle} 的推文" + (f": {snippet[:30]}..." if snippet else ""),
                url=x_search_url,
                author=f"@{handle}",
                confidence=0.88 if snippet else 0.75,
                matched_method="handle_text_query",
                extra_urls=[
                    {"name": f"直达 @{handle} 主页", "url": profile_url},
                    {"name": "在 Google 检索原推文", "url": google_search_url}
                ],
                raw_details={"handle": handle, "snippet": snippet}
            )

        # 3. Only text snippet without clear handle
        if len(text.strip()) > 10:
            snippet = text.strip()[:50]
            x_search_url = f"https://x.com/search?q={quote(snippet)}&f=live"
            return PlatformResult(
                platform="twitter",
                platform_name="X (Twitter)",
                title=f"X (Twitter) 搜索：{snippet[:30]}...",
                url=x_search_url,
                confidence=0.6,
                matched_method="text_search_fallback",
                extra_urls=[
                    {"name": "在 Google 检索原推文", "url": f"https://www.google.com/search?q=site:x.com+{quote(snippet)}"}
                ]
            )

        return None
