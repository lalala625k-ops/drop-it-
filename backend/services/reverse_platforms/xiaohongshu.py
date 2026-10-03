import re
from typing import Optional, Dict, Any
from urllib.parse import quote
from .base import PlatformResult

class XiaohongshuResolver:
    def extract_red_id(self, text: str) -> Optional[str]:
        match = re.search(r'(?:小红书号|RED\s*ID)[:：\s]*([a-zA-Z0-9_\.]{4,20})', text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
        return None

    def resolve(self, text: str, author: Optional[str] = None, title: Optional[str] = None) -> Optional[PlatformResult]:
        red_id = self.extract_red_id(text) if text else None
        
        query = (title or "").strip()
        if not query and text:
            lines = [line.strip() for line in text.split("\n") if len(line.strip()) > 3]
            filtered = [l for l in lines if not any(w in l for w in ["关注", "点赞", "收藏", "评论", "小红书", "分享", "我"])]
            query = filtered[0] if filtered else text[:30].strip()

        # Clean query for search
        clean_title = re.sub(r'#\S+', '', query).strip()
        if not clean_title:
            clean_title = query

        # Clean author from noisy UI words
        if author and any(w in author for w in ["原图", "预览", "关注", "编辑", "分享", "评论", "赞"]):
            author = None

        search_query = clean_title

        search_url = f"https://www.xiaohongshu.com/search_result?keyword={quote(search_query)}"
        
        extra_urls = [
            {"name": "在小红书搜索该笔记", "url": search_url}
        ]
        if author:
            extra_urls.append({"name": f"搜索博主 ({author})", "url": f"https://www.xiaohongshu.com/search_result?keyword={quote(author)}"})
        extra_urls.append({"name": "在百度搜索笔记原帖", "url": f"https://www.baidu.com/s?wd=site:xiaohongshu.com+{quote(clean_title)}"})

        confidence = 0.95 if (title or author) else (0.90 if red_id else 0.75)
        matched_method = "ai_vision_xhs_search" if title else ("red_id_match" if red_id else "xhs_search")

        return PlatformResult(
            platform="xiaohongshu",
            platform_name="小红书 (Xiaohongshu)",
            title=title or f"小红书笔记：{clean_title[:30]}",
            url=search_url,
            author=author or (f"小红书号: {red_id}" if red_id else None),
            confidence=confidence,
            matched_method=matched_method,
            extra_urls=extra_urls,
            raw_details={
                "red_id": red_id,
                "query": search_query,
                "clean_title": clean_title
            },
            candidates=[]
        )
