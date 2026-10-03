"""Best-effort public Xiaohongshu search-page extraction.

The page often renders results only after client-side requests. Never invent
note links from the search URL or model-provided IDs.
"""

from urllib.parse import quote, urljoin

import requests
from bs4 import BeautifulSoup

from backend.services.reverse_search_service import _source_url
from backend.services.reverse_trace import record


def search_page_url(title: str) -> str:
    return "https://www.xiaohongshu.com/search_result?keyword=" + quote(title[:80].strip())


def search_public_page(title: str, proxies: dict | None) -> tuple[list[dict], str]:
    url = search_page_url(title)
    try:
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0",
                                              "Accept-Language": "zh-CN,zh;q=0.9"},
                                proxies=proxies, timeout=8)
        record("site_request", "completed" if response.ok else "failed",
               "小红书公开搜索页", url, response.status_code)
        response.raise_for_status()
    except requests.RequestException:
        return [], "failed"

    soup = BeautifulSoup(response.text, "html.parser")
    items: list[dict] = []
    seen: set[str] = set()
    for anchor in soup.select("a[href]"):
        link = _source_url(urljoin(url, anchor.get("href", "")), "xiaohongshu", "xiaohongshu.com")
        if not link or link in seen:
            continue
        seen.add(link)
        label = anchor.get_text(" ", strip=True)[:160]
        if not label:
            image = anchor.select_one("img[alt]")
            label = image.get("alt", "")[:160] if image else ""
        items.append({"url": link, "title": label or "小红书笔记", "author": ""})
        if len(items) == 5:
            break
    record("site_results", "completed" if items else "unavailable",
           f"公开页面中读取到 {len(items)} 条笔记链接" if items else
           "公开页面未包含笔记链接；结果可能由浏览器脚本加载或要求登录")
    return items, "completed" if items else "unavailable"
