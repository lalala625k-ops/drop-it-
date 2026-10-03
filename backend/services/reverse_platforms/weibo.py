import re
from typing import Optional
from urllib.parse import quote
from .base import PlatformResult

class WeiboResolver:
    def resolve(self, text: str, author: Optional[str] = None, title: Optional[str] = None) -> Optional[PlatformResult]:
        query = title or ""
        if not query:
            lines = [l.strip() for l in text.split("\n") if len(l.strip()) > 3]
            filtered = [l for l in lines if not any(w in l for w in ["微博", "转发", "评论", "赞", "关注", "发布于"])]
            query = filtered[0] if filtered else text[:30].strip()

        search_url = f"https://s.weibo.com/weibo?q={quote(query)}"
        extra_urls = [
            {"name": "在微博检索", "url": search_url},
            {"name": "在百度检索原博文", "url": f"https://www.baidu.com/s?wd=site:weibo.com+{quote(query)}"}
        ]
        if author:
            extra_urls.insert(0, {"name": f"在微博搜索作者: {author}", "url": f"https://s.weibo.com/user?q={quote(author)}"})

        return PlatformResult(
            platform="weibo",
            platform_name="新浪微博 (Weibo)",
            title=title or f"微博正文：{query[:25]}",
            url=search_url,
            author=author,
            confidence=0.78,
            matched_method="weibo_search",
            extra_urls=extra_urls,
            raw_details={"author": author, "query": query}
        )
