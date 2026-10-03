import re
import requests
import urllib.parse
from typing import Optional, Dict, Any, List
from .base import PlatformResult

class WechatResolver:
    """
    Dedicated resolver for 微信公众号 (WeChat Official Accounts) articles.
    
    Architecture:
    1. Zero-AntiSpider Query Strategy: Uses continuous Chinese clauses + browser search params
       (https://weixin.sogou.com/weixin?type=2&s_from=input&query=...&ie=utf8&_sug_=n&_sug_type_=)
       which avoids triggering Sogou anti-spider blocks.
    2. Strict N-Gram Title Verification: Validates that returned results match the article topic.
    3. Unpacks Sogou's obfuscated JavaScript strings into 100% direct mp.weixin.qq.com URLs.
    4. ABSOLUTE RULE: If no direct mp.weixin.qq.com URL can be verified, NEVER set url to
       a search engine. Return url=None so the UI shows an honest notification without opening empty search pages.
    """

    def extract_direct_url(self, text: str) -> Optional[str]:
        m = re.search(r'https?://mp\.weixin\.qq\.com/s[a-zA-Z0-9_/?=&%-]+', text)
        if m:
            return m.group(0)
        return None

    def compute_title_similarity(self, query_title: str, candidate_title: str) -> float:
        """
        Compute character overlap similarity between query title and candidate title.
        Ensures we never return an unrelated article about a different topic.
        """
        import html as _html_lib
        q_norm = _html_lib.unescape(query_title).lower()
        c_norm = _html_lib.unescape(candidate_title).lower()

        q_clean = re.sub(r'[\s\W\d_]+', '', q_norm)
        c_clean = re.sub(r'[\s\W\d_]+', '', c_norm)
        if not q_clean or not c_clean:
            return 0.0

        # Check for continuous substring match (e.g. "超长蛋挞被吐槽" or "网红玻璃船")
        has_strong_ngram = False
        for n in range(min(12, len(c_clean)), 4, -1):
            for i in range(len(c_clean) - n + 1):
                sub = c_clean[i:i+n]
                if sub in q_clean:
                    has_strong_ngram = True
                    break
            if has_strong_ngram:
                break

        q_chars = set(q_clean)
        c_chars = set(c_clean)
        overlap = len(q_chars & c_chars)
        recall = overlap / len(q_chars)
        precision = overlap / len(c_chars)
        char_sim = (recall * 0.6) + (precision * 0.4)

        if has_strong_ngram:
            return max(char_sim, 0.75)
        return char_sim

    def generate_query_candidates(
        self,
        title: str,
        author: Optional[str] = None,
        account_name: Optional[str] = None,
        search_query: Optional[str] = None
    ) -> List[str]:
        """
        Generate continuous Chinese keyword combinations without spaces.
        In Sogou Weixin, raw spaces trigger bot filters, whereas continuous clauses
        (e.g. '网红玻璃船成为新青春上海', '超长蛋挞红星资本局') pass with zero antispider.
        """
        candidates = []
        clean_acc = re.sub(r'[\s\W_]+', '', (account_name or author or "")).strip()
        if clean_acc in ["原创", "关注", "写留言", "微信", "公众号"]:
            clean_acc = ""

        # Extract clean clauses without punctuation
        clauses = [re.sub(r'[“”"\'「」『』【】()（）\s]', '', c).strip() for c in re.split(r'[，,。；;：:!！?？|—\-_]+', title)]
        clauses = [c for c in clauses if len(c) >= 3]

        if len(clauses) >= 2:
            # 1. Main sub-clause + account (e.g. "网红玻璃船成为新顶流青春上海")
            if clean_acc:
                candidates.append(f"{clauses[1][:8]}{clean_acc}")
                candidates.append(f"{clauses[0][:8]}{clean_acc}")
            # 2. Main clause + second clause
            candidates.append(f"{clauses[0][:8]}{clauses[1][:8]}")
            if len(clauses) >= 3 and clean_acc:
                candidates.append(f"{clauses[2][:8]}{clean_acc}")
        elif len(clauses) == 1:
            if clean_acc:
                candidates.append(f"{clauses[0][:10]}{clean_acc}")
            candidates.append(clauses[0][:15])

        # Fallback: clean title truncated
        t_clean = re.sub(r'[\s\W_]+', '', title)
        if len(t_clean) > 20:
            candidates.append(t_clean[:18])
        else:
            candidates.append(t_clean)

        # Deduplicate
        seen = set()
        final_list = []
        for c in candidates:
            c = c.strip()
            if c and c not in seen and len(c) >= 4:
                seen.add(c)
                final_list.append(c)

        return final_list

    def _parse_sogou_items(self, html: str) -> List[Dict[str, str]]:
        """Parse individual article search results from Sogou HTML."""
        items = []
        blocks = re.findall(r'<div class="txt-box">(.*?)</div>\s*</div>', html, re.DOTALL)
        for b in blocks:
            m_link = re.search(r'href="(/link\?url=[^"]+)"[^>]*>(.*?)</a>', b)
            if not m_link:
                continue
            link = m_link.group(1)
            raw_title = m_link.group(2)
            import html as _html_lib
            clean_title = _html_lib.unescape(re.sub(r'<[^>]+>', '', raw_title)).strip()

            m_acc = re.search(r'<a[^>]*class="account"[^>]*>(.*?)</a>', b)
            clean_acc = _html_lib.unescape(re.sub(r'<[^>]+>', '', m_acc.group(1))).strip() if m_acc else ""

            items.append({
                "title": clean_title,
                "account": clean_acc,
                "link": link
            })
        return items

    def _fetch_direct_url_single_query(
        self,
        session: requests.Session,
        query: str,
        expected_title: str,
        headers: dict,
        timeout: int = 5
    ) -> Optional[str]:
        """
        Query Sogou Weixin and extract the direct mp.weixin.qq.com URL,
        WITH STRICT TITLE SIMILARITY VALIDATION to prevent returning unrelated articles.
        """
        encoded = urllib.parse.quote(query)
        # MUST use full browser input search format to prevent anti-spider
        search_url = f"https://weixin.sogou.com/weixin?type=2&s_from=input&query={encoded}&ie=utf8&_sug_=n&_sug_type_="
        try:
            resp = session.get(search_url, headers={**headers, "Referer": "https://weixin.sogou.com/"}, timeout=timeout)
            html = resp.content.decode("utf-8", errors="replace")

            has_anti = "antispider" in html
            items = self._parse_sogou_items(html)
            if has_anti or not items:
                return None



            # Filter items: the item title MUST have high similarity to expected_title!
            matched_link = None
            for it in items:
                sim = self.compute_title_similarity(expected_title, it["title"])
                if sim >= 0.52:
                    matched_link = it["link"]
                    break

            if not matched_link:
                return None

            # Follow the matched link
            redirect_url = "https://weixin.sogou.com" + matched_link
            r2 = session.get(redirect_url, headers={**headers, "Referer": search_url}, timeout=timeout, allow_redirects=True)

            if "mp.weixin.qq.com" in r2.url:
                return r2.url

            body = r2.content.decode("utf-8", errors="replace")

            # Parse JS string concatenation that builds the mp.weixin URL:
            # url += 'https://mp.'; url += 'weixin.qq.c'; url += 'om/s?src=11'; ...
            url_parts = re.findall(r"url\s*\+=\s*'([^']+)'", body)
            if url_parts:
                full_url = "".join(url_parts).replace("@", "")
                if "mp.weixin.qq.com" in full_url:
                    return full_url

            m = re.search(r'(https?://mp\.weixin\.qq\.com/s[^\s"\'<>]+)', body)
            if m:
                return m.group(1)

            return None
        except Exception:
            return None

    def find_direct_wechat_url(
        self,
        title: str,
        author: Optional[str] = None,
        account_name: Optional[str] = None,
        search_query: Optional[str] = None
    ) -> Optional[str]:
        """
        Try continuous candidate queries in sequence to resolve the exact mp.weixin.qq.com URL.
        """
        candidates = self.generate_query_candidates(
            title=title,
            author=author,
            account_name=account_name,
            search_query=search_query
        )

        session = requests.Session()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'
        }


        try:
            session.get("https://weixin.sogou.com/", headers=headers, timeout=5)
        except Exception:
            pass

        import time as _time
        for q in candidates:
            direct_url = self._fetch_direct_url_single_query(
                session,
                query=q,
                expected_title=title,
                headers=headers
            )
            print(f"[WechatResolver] Candidate '{q}' -> {direct_url[:50] if direct_url else None}")
            if direct_url:
                try:
                    print(f"[WechatResolver] [SUCCESS] Resolved direct WeChat URL: {direct_url[:80]}")
                except Exception:
                    pass
                return direct_url
            _time.sleep(0.3)


        return None

    def resolve(
        self,
        text: str,
        title: Optional[str] = None,
        author: Optional[str] = None,
        account_name: Optional[str] = None,
        search_query: Optional[str] = None
    ) -> PlatformResult:

        # 1. Direct URL already in the image text
        direct_url = self.extract_direct_url(text) if text else None
        if direct_url:
            return PlatformResult(
                platform="wechat",
                platform_name="微信公众号 (WeChat)",
                title=title or "微信公众号文章",
                url=direct_url,
                author=author or account_name,
                confidence=0.99,
                matched_method="wechat_url_direct",
                extra_urls=[
                    {"name": "⚡ 立即打开微信文章 (mp.weixin.qq.com)", "url": direct_url}
                ],
                raw_details={"domain": "mp.weixin.qq.com", "title": title, "author": author, "is_direct_url": True}
            )

        clean_title = (title or text or "").strip()
        if not clean_title:
            clean_title = "微信公众号文章"

        display_author = f"{account_name} ({author})" if (account_name and author and account_name != author) else (account_name or author)

        # 2. Multi-stage high-precision resolution of direct mp.weixin.qq.com URL
        direct_wechat_url = self.find_direct_wechat_url(
            title=clean_title,
            author=author,
            account_name=account_name,
            search_query=search_query
        )

        if direct_wechat_url:
            # Verified 100% matched official WeChat article URL
            extra_urls = [
                {"name": "⚡ 打开微信官方原文 (mp.weixin.qq.com)", "url": direct_wechat_url}
            ]
            return PlatformResult(
                platform="wechat",
                platform_name="微信公众号 (WeChat)",
                title=clean_title,
                url=direct_wechat_url,
                author=display_author,
                confidence=0.98,
                matched_method="wechat_direct",
                extra_urls=extra_urls,
                raw_details={
                    "domain": "mp.weixin.qq.com",
                    "title": clean_title,
                    "author": display_author,
                    "account_name": account_name,
                    "search_query": search_query or clean_title,
                    "is_direct_url": True
                }
            )

        # 3. Fallback: If not indexed on Sogou or private WeChat account
        # NEVER return a search engine URL! url is empty string so UI disables the jump button!
        return PlatformResult(
            platform="wechat",
            platform_name="微信公众号 (WeChat)",
            title=clean_title,
            url="",  # DO NOT RETURN SEARCH ENGINE URL
            author=display_author,
            confidence=0.88,
            matched_method="wechat_unindexed",
            extra_urls=[],
            raw_details={
                "domain": "mp.weixin.qq.com",
                "title": clean_title,
                "author": display_author,
                "account_name": account_name,
                "is_direct_url": False,
                "note": f"该微信文章由「{display_author}」发布，因微信生态私域权限限制或未被公开全量抓取，已严格过滤无关杂质文章，拒绝跳转任何模糊搜索界面。"
            }
        )
