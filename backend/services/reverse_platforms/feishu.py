import re
import urllib.parse
from urllib.parse import quote
from typing import Optional, Dict, Any, List
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor
from .base import PlatformResult

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
}

FEISHU_URL_REGEX = re.compile(
    r'https?://[a-zA-Z0-9_\-\.]*feishu\.cn/(?:wiki|docx|docs|sheets|base)/[a-zA-Z0-9]+(?:\?[^\s"\'<>]+)?',
    re.IGNORECASE
)

def clean_feishu_url(raw_url: str) -> str:
    cleaned = raw_url.rstrip('.,;!?: \ufffd"\'\n\r\t()[]<>%）')
    cleaned = re.sub(r'[\ufffd\x00-\x1f]+$', '', cleaned)
    cleaned = re.sub(r'%[0-9a-fA-F]{2}$', '', cleaned)
    return cleaned

def fetch_bili_video_desc(bvid: str) -> str:
    try:
        url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
        r = requests.get(url, headers=HEADERS, timeout=2.5)
        if r.status_code == 200:
            return r.json().get("data", {}).get("desc", "")
    except Exception:
        pass
    return ""

def discover_feishu_doc_live(title: str, timeout_sec: float = 3.0) -> Optional[str]:
    """
    Active multi-channel reverse lookup to discover public Feishu wiki/docx URLs
    by scanning companion video descriptions, tech blogs, and search engine results.
    """
    if not title or len(title.strip()) < 3:
        return None

    clean_title = re.sub(r'^[^\w\u4e00-\u9fa5]*[>»›/]\s*', '', title).strip()
    # Core title before pipe, dash, or ellipsis
    core_title = re.split(r'[|｜—_…\.\.]{1,}', clean_title)[0].strip()
    if len(core_title) < 4:
        core_title = clean_title

    found_urls: List[str] = []

    def search_bili():
        try:
            from .bilibili import BilibiliResolver
            b = BilibiliResolver()
            img_k, sub_k = b._get_wbi_keys()
            
            q_terms = [
                core_title,
                core_title.replace(" ", ""),
                " ".join(core_title.split()[:4])
            ]
            # Deduplicate preserving order
            seen_terms = set()
            query_list = []
            for qt in q_terms:
                qt = qt.strip()
                if qt and qt not in seen_terms:
                    seen_terms.add(qt)
                    query_list.append(qt)

            for q_term in query_list:
                for order in ["click", "totalrank"]:
                    params = {"keyword": q_term, "search_type": "video", "order": order}
                    signed = b._enc_wbi(params, img_k, sub_k)
                    url = "https://api.bilibili.com/x/web-interface/wbi/search/type"
                    r = b.session.get(url, params=signed, timeout=2.0).json()
                    items = r.get("data", {}).get("result", [])
                    if isinstance(items, list):
                        for it in items[:6]:
                            desc = it.get("desc", "")
                            m = FEISHU_URL_REGEX.findall(desc)
                            if m:
                                found_urls.append(clean_feishu_url(m[0]))
                                return
                            bvid = it.get("bvid")
                            if bvid:
                                try:
                                    v_r = b.session.get(f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}", timeout=1.5).json()
                                    full_desc = v_r.get("data", {}).get("desc", "")
                                    fm = FEISHU_URL_REGEX.findall(full_desc)
                                    if fm:
                                        found_urls.append(clean_feishu_url(fm[0]))
                                        return
                                except Exception:
                                    pass
        except Exception:
            pass

    def search_ddg():
        try:
            url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(core_title)}"
            r = requests.get(url, headers=HEADERS, timeout=timeout_sec)
            if r.status_code == 200:
                # 1. Direct regex match on HTML
                m = FEISHU_URL_REGEX.findall(r.text)
                for u in m:
                    found_urls.append(clean_feishu_url(u))
                if found_urls:
                    return

                # 2. Check Bilibili companion video descriptions
                bvids = re.findall(r'BV1[0-9a-zA-Z]{9}', r.text)
                for bvid in set(bvids[:3]):
                    desc = fetch_bili_video_desc(bvid)
                    desc_m = FEISHU_URL_REGEX.findall(desc)
                    for u in desc_m:
                        found_urls.append(clean_feishu_url(u))
                if found_urls:
                    return

                # 3. Check technical blogs / notes
                soup = BeautifulSoup(r.text, 'html.parser')
                for a in soup.find_all('a', class_='result__url')[:4]:
                    raw_href = a.get_text().strip()
                    if raw_href and ("github.io" in raw_href or "blog" in raw_href or "feishu" in raw_href):
                        try:
                            blog_r = requests.get(f"https://{raw_href}", headers=HEADERS, timeout=2.0)
                            bm = FEISHU_URL_REGEX.findall(blog_r.text)
                            for u in bm:
                                found_urls.append(clean_feishu_url(u))
                        except Exception:
                            pass
        except Exception:
            pass

    def search_bing():
        try:
            url = f"https://www.bing.com/search?q={urllib.parse.quote(core_title + ' feishu')}"
            r = requests.get(url, headers=HEADERS, timeout=timeout_sec)
            if r.status_code == 200:
                m = FEISHU_URL_REGEX.findall(r.text)
                for u in m:
                    found_urls.append(clean_feishu_url(u))
        except Exception:
            pass

    # Priority 1: Fast Bilibili WBI query (0.3s - 0.8s)
    search_bili()
    if found_urls:
        return found_urls[0]

    # Priority 2: Concurrent DDG and Bing fallback
    try:
        from concurrent.futures import as_completed
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(search_ddg), executor.submit(search_bing)]
            for fut in as_completed(futures, timeout=timeout_sec):
                if found_urls:
                    return found_urls[0]
    except Exception:
        pass

    if found_urls:
        return found_urls[0]
    return None


class FeishuResolver:
    """
    Dedicated resolver for Feishu / Lark Cloud Documents and Wikis.
    Supports:
    1. Direct document token/URL extraction from screenshot text
    2. Active real-time multi-channel web discovery for public companion Feishu docs
    3. Targeted Google Lucky / Bing site:feishu.cn deep navigation (NEVER defaults to Baidu)
    """

    def extract_doc_token(self, text: str) -> Optional[str]:
        match = re.search(r'https?://[a-zA-Z0-9_\-\.]*feishu\.cn/(?:docx|wiki|docs|sheets|base)/([a-zA-Z0-9]+)', text, re.IGNORECASE)
        if match:
            return match.group(0)
        match2 = re.search(r'[a-zA-Z0-9_\-\.]*feishu\.cn/(?:docx|wiki|docs|sheets|base)/([a-zA-Z0-9]+)', text, re.IGNORECASE)
        if match2:
            return f"https://{match2.group(0)}"
        return None

    def resolve(
        self,
        text: str,
        title: Optional[str] = None,
        author: Optional[str] = None
    ) -> PlatformResult:
        # 1. Check if direct URL exists in text/OCR
        direct_url = self.extract_doc_token(text) if text else None
        if direct_url:
            return PlatformResult(
                platform="feishu",
                platform_name="飞书文档 (Feishu)",
                title=title or "飞书云文档",
                url=direct_url,
                author=author,
                confidence=0.99,
                matched_method="feishu_doc_direct",
                extra_urls=[
                    {"name": "⚡ 立即在飞书打开文档", "url": direct_url}
                ],
                raw_details={
                    "domain": "feishu.cn",
                    "title": title or "飞书云文档",
                    "author": author,
                    "is_direct_url": True
                }
            )

        # 2. Clean and normalize document title
        raw_title = (title or text or "").strip()
        clean_title = re.sub(r'^[^\w\u4e00-\u9fa5]*[>»›/]\s*', '', raw_title)
        clean_title = re.sub(r'\s*[/|]?\s*最后更新[:：]?.*$', '', clean_title, flags=re.IGNORECASE).strip()
        if not clean_title:
            clean_title = "飞书云文档"

        # 3. Clean author from background watermarks or UI labels
        clean_author = (author or "").strip()
        if clean_author:
            noise_words = ["原图预览", "关注", "编辑", "分享", "评论", "协作者", "未明确显示", "张三", "豆包", "向我提问", "ai速读"]
            for noise in noise_words:
                if noise in clean_author.lower():
                    clean_author = None
                    break

        # 4. Active Real-Time Web Discovery for public companion Feishu doc
        discovered_url = discover_feishu_doc_live(clean_title)
        if discovered_url:
            return PlatformResult(
                platform="feishu",
                platform_name="飞书文档 (Feishu)",
                title=clean_title,
                url=discovered_url,
                author=clean_author,
                confidence=0.99,
                matched_method="feishu_doc_direct",
                extra_urls=[
                    {"name": "⚡ 立即在飞书打开此文档", "url": discovered_url},
                    {"name": "Google 智能直达 (site:feishu.cn)", "url": f"https://www.google.com/search?q={quote(f'site:feishu.cn \"{clean_title}\"')}&btnI=1"},
                    {"name": "Bing 定向反查", "url": f"https://www.bing.com/search?q={quote(f'site:feishu.cn {clean_title}')}"}
                ],
                raw_details={
                    "domain": "feishu.cn",
                    "title": clean_title,
                    "author": clean_author,
                    "is_direct_url": True,
                    "discovered_via": "realtime_web_discovery"
                }
            )

        # 5. Fallback for unindexed/private enterprise docs:
        core_query = re.split(r'[|｜—_…\.\.]{1,}', clean_title)[0].strip()
        if len(core_query) < 4:
            core_query = clean_title
            
        dork_query = f'site:feishu.cn {core_query}'
        
        bing_dork = f"https://www.bing.com/search?q={quote(dork_query)}"
        google_dork = f"https://www.google.com/search?q={quote(dork_query)}"
        google_lucky = f"https://www.google.com/search?q={quote(dork_query)}&btnI=1"
        feishu_home = "https://www.feishu.cn/drive/me/"

        # Use Bing as primary fallback (works reliably in China without captcha)
        primary_url = bing_dork

        extra_urls = [
            {"name": "Bing 全网定向反查 (site:feishu.cn)", "url": bing_dork},
            {"name": "Google 定向检索 (site:feishu.cn)", "url": google_dork},
            {"name": "🚀 Google 原站智能直达 (手气不错)", "url": google_lucky},
            {"name": "打开飞书网页工作台", "url": feishu_home}
        ]

        if clean_author:
            author_search = f"https://www.bing.com/search?q={quote(f'site:feishu.cn {clean_author}')}"
            extra_urls.append({"name": f"搜索该作者飞书文档 ({clean_author})", "url": author_search})

        return PlatformResult(
            platform="feishu",
            platform_name="飞书文档 (Feishu)",
            title=clean_title,
            url=primary_url,
            author=clean_author,
            confidence=0.95,
            matched_method="ai_vision_feishu_search",
            extra_urls=extra_urls,
            raw_details={
                "domain": "feishu.cn",
                "title": clean_title,
                "author": clean_author,
                "dork_query": dork_query,
                "is_dork_search": True,
                "is_direct_url": False
            },
            candidates=[]
        )
