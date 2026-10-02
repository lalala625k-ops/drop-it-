# ==============================================================================
# RULE ID: E-001 | Feishu (飞书 / Lark)
# STATUS: ⏳ EXPERIMENTAL (统一无封面；私密文档仍需鉴权)
# ==============================================================================

import re
from typing import Optional
import requests
from bs4 import BeautifulSoup
from backend.services.scrapers.base import BaseScraper, ScrapedMetadata
from backend.services.screenshot_service import detect_local_proxy

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

class FeishuScraper(BaseScraper):
    name = "feishu"
    status = "EXPERIMENTAL"

    def can_handle(self, url: str) -> bool:
        lower = url.lower()
        return "feishu.cn" in lower or "larksuite.com" in lower

    def scrape(self, url: str) -> Optional[ScrapedMetadata]:
        title = ""
        description = ""

        try:
            proxy = detect_local_proxy()
            proxies = {"http": proxy, "https": proxy} if proxy else None
            resp = requests.get(url, headers=HEADERS, proxies=proxies, timeout=8, allow_redirects=True)
            resp.encoding = resp.apparent_encoding or "utf-8"
            html = resp.text
            soup = BeautifulSoup(html, "html.parser")
            fake_title = soup.find(id="fakeTitle")
            if fake_title:
                title = fake_title.get_text(strip=True)

            if not title:
                meta_m = re.search(r'["\']title["\']\s*:\s*["\']([^"\']+)["\']', html)
                if meta_m:
                    title = meta_m.group(1).encode("utf-8").decode("unicode_escape", errors="ignore")

            desc_m = re.search(r'["\']description["\']\s*:\s*["\']([^"\']+)["\']', html)
            if desc_m:
                description = desc_m.group(1).encode("utf-8").decode("unicode_escape", errors="ignore")

        except Exception as e:
            print(f"[Experimental Feishu] Request error: {e}")

        # If title is empty or is a login prompt, infer document type from URL pattern
        if not title or any(k in title for k in ["登录", "Login", "Sign in", "Accounts"]):
            if "/docx/" in url or "/docs/" in url:
                title = "飞书云文档"
            elif "/wiki/" in url:
                title = "飞书知识库"
            elif "/base/" in url or "/bitable/" in url:
                title = "飞书多维表格"
            elif "/sheets/" in url:
                title = "飞书电子表格"
            elif "/mindnotes/" in url:
                title = "飞书思维笔记"
            elif "/file/" in url:
                title = "飞书云文件"
            else:
                title = "飞书文档"

        return {
            "title": title,
            "description": description or "飞书协同办公文档 (待登录鉴权突破)",
            "image": "",
            "favicon": "https://www.feishu.cn/favicon.ico",
            "url": url,
        }
