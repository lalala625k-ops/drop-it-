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

class ThePaperResolver:
    """
    Dedicated resolver for 澎湃新闻 (The Paper) articles and news reports.
    Resolves directly to the exact article detail page (https://www.thepaper.cn/newsDetail_forward_{id})
    instead of sending users to captcha-blocked 0-result search pages (https://www.thepaper.cn/searchResult).
    """

    def extract_direct_url(self, text: str) -> Optional[str]:
        m = re.search(r'https?://(?:www\.|m\.)?thepaper\.cn/newsDetail_forward_([0-9]+)', text)
        if m:
            return f"https://www.thepaper.cn/newsDetail_forward_{m.group(1)}"
        return None

    def search_exact_article(
        self,
        title: str,
        author: Optional[str] = None,
        search_query: Optional[str] = None,
        distinctive_text: Optional[str] = None
    ) -> Optional[str]:
        if not title:
            return None
        
        # Punctuation cleaning
        clean_title = re.sub(r'[\u201c\u201d\u2018\u2019"\'`：:，,。！？!?[\]【】()（）_—\-\s]+', ' ', title).strip()
        segments = [s.strip() for s in clean_title.split() if len(s.strip()) >= 2]

        # Extract meaningful sub-phrases (4-8 chars)
        phrases = []
        for seg in segments:
            if len(seg) <= 8:
                phrases.append(seg)
            else:
                for i in range(0, len(seg) - 4, 3):
                    phrases.append(seg[i:i+6])
                phrases.append(seg[-6:])

        queries = []
        # Key combination: phrase 0 + phrase 2 (e.g. 国际货币基金组织 经贸团队磋商 澎湃)
        if len(phrases) >= 3:
            queries.append(f"{phrases[0]} {phrases[2]} 澎湃")
        if len(phrases) >= 2:
            queries.append(f"{phrases[0]} {phrases[1]} 澎湃")

        if author:
            clean_author = re.sub(r'[/_—\-新华社].*', '', author).strip()
            if clean_author and phrases:
                queries.append(f"{phrases[0]} {clean_author} 澎湃")

        # Also add search_query words if available
        if search_query:
            sq_words = [w.strip() for w in search_query.split() if len(w.strip()) >= 2 and w.strip() not in ["澎湃新闻", "澎湃", "site:thepaper.cn", "www.thepaper.cn"]]
            if len(sq_words) >= 3:
                queries.append(f"{sq_words[0]} {sq_words[2]} 澎湃")
            if len(sq_words) >= 2:
                queries.append(f"{sq_words[0]} {sq_words[1]} 澎湃")

        paper_pattern = re.compile(r'thepaper\.cn/newsDetail_forward_([0-9]+)', re.IGNORECASE)
        wap_pattern = re.compile(r'(?:pcurl|url)=https?%3A%2F%2F(?:www\.|m\.)?thepaper\.cn%2FnewsDetail_forward_([0-9]+)', re.IGNORECASE)

        headers_mobile = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        }

        seen = set()
        for q in queries:
            if q in seen:
                continue
            seen.add(q)
            # 1. Fast mobile search (contains unencrypted pcurl/url directly in HTML, never 403s)
            try:
                wap_url = "https://m.sogou.com/web/searchList.jsp?keyword=" + urllib.parse.quote(q)
                r_wap = requests.get(wap_url, headers=headers_mobile, timeout=3.5)
                m_wap = wap_pattern.search(r_wap.text)
                if m_wap:
                    return f"https://www.thepaper.cn/newsDetail_forward_{m_wap.group(1)}"
            except Exception:
                pass

            # 2. Desktop search fallback
            url = "https://www.sogou.com/web?query=" + urllib.parse.quote(q)
            try:
                r = requests.get(url, headers=HEADERS, timeout=3.5)
                # First check direct match in html
                m = paper_pattern.search(r.text)
                if m:
                    return f"https://www.thepaper.cn/newsDetail_forward_{m.group(1)}"

                soup = BeautifulSoup(r.text, 'html.parser')
                for h3 in soup.find_all('h3')[:6]:
                    a = h3.find('a')
                    if not a or not a.get('href'):
                        continue
                    href = a['href']
                    if href.startswith('/link?url='):
                        link_url = "https://www.sogou.com" + href
                        r_link = requests.get(link_url, headers=HEADERS, timeout=2.5)
                        m2 = paper_pattern.search(r_link.text)
                        if m2:
                            return f"https://www.thepaper.cn/newsDetail_forward_{m2.group(1)}"
            except Exception:
                pass

        return None

    def resolve(
        self,
        text: str,
        title: Optional[str] = None,
        author: Optional[str] = None,
        found_id: Optional[str] = None,
        search_query: Optional[str] = None,
        distinctive_text: Optional[str] = None
    ) -> PlatformResult:
        # 1. Direct URL in text
        direct_url = self.extract_direct_url(text) if text else None
        if direct_url:
            return PlatformResult(
                platform="thepaper",
                platform_name="澎湃新闻 (The Paper)",
                title=title or "澎湃新闻报道",
                url=direct_url,
                author=author,
                confidence=0.99,
                matched_method="thepaper_url_direct",
                extra_urls=[
                    {"name": "⚡ 立即打开澎湃新闻原报道 (原网页)", "url": direct_url}
                ],
                raw_details={"domain": "thepaper.cn", "title": title, "author": author, "is_direct_url": True}
            )

        # 2. Check explicit forward ID
        if found_id and str(found_id).strip().isdigit():
            fid = str(found_id).strip()
            primary_url = f"https://www.thepaper.cn/newsDetail_forward_{fid}"
            return PlatformResult(
                platform="thepaper",
                platform_name="澎湃新闻 (The Paper)",
                title=title or f"澎湃新闻报道 #{fid}",
                url=primary_url,
                author=author,
                confidence=0.98,
                matched_method="thepaper_id_direct",
                extra_urls=[
                    {"name": "⚡ 立即打开澎湃新闻原报道 (原网页)", "url": primary_url}
                ],
                raw_details={"domain": "thepaper.cn", "id": fid, "is_direct_url": True}
            )

        clean_title = (title or text or "").strip()
        if not clean_title:
            clean_title = "澎湃新闻"

        # 3. Active Real-time Reverse Lookup for original news article URL
        exact_url = self.search_exact_article(
            clean_title,
            author=author,
            search_query=search_query,
            distinctive_text=distinctive_text
        )
        if exact_url:
            return PlatformResult(
                platform="thepaper",
                platform_name="澎湃新闻 (The Paper)",
                title=clean_title,
                url=exact_url,
                author=author,
                confidence=0.98,
                matched_method="thepaper_article_direct",
                extra_urls=[
                    {"name": "⚡ 立即打开澎湃新闻原报道 (原网页)", "url": exact_url},
                    {"name": "百度定向原址反查 (site:thepaper.cn)", "url": f"https://www.baidu.com/s?wd={urllib.parse.quote(f'site:thepaper.cn {clean_title}')}"},
                    {"name": "Google 定向反查", "url": f"https://www.google.com/search?q={urllib.parse.quote(f'site:thepaper.cn {clean_title}')}"}
                ],
                raw_details={
                    "domain": "thepaper.cn",
                    "title": clean_title,
                    "author": author,
                    "is_direct_url": True,
                    "discovered_via": "thepaper_exact_index"
                }
            )

        # 4. Fallback: NEVER direct to broken /searchResult page!
        # Use precision Google Lucky direct or Baidu dork
        baidu_dork = f"https://www.baidu.com/s?wd={urllib.parse.quote(f'site:thepaper.cn \"{clean_title}\"')}"
        google_lucky = f"https://www.google.com/search?q={urllib.parse.quote(f'site:thepaper.cn \"{clean_title}\"')}&btnI=1"
        site_search = f"https://www.thepaper.cn/searchResult?id={urllib.parse.quote(clean_title)}"

        return PlatformResult(
            platform="thepaper",
            platform_name="澎湃新闻 (The Paper)",
            title=clean_title,
            url=baidu_dork,
            author=author,
            confidence=0.88,
            matched_method="thepaper_dork_fallback",
            extra_urls=[
                {"name": "百度定向原址反查 (site:thepaper.cn)", "url": baidu_dork},
                {"name": "🚀 Google 原站直达 (手气不错)", "url": google_lucky},
                {"name": "在澎湃新闻站内检索", "url": site_search}
            ],
            raw_details={
                "domain": "thepaper.cn",
                "title": clean_title,
                "author": author,
                "is_direct_url": False
            }
        )
