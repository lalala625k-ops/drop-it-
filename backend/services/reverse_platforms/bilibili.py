import re
import time
import hashlib
import difflib
from typing import Optional, Dict, Any, List
from urllib.parse import urlencode, quote
import requests
from backend.services.reverse_trace import record

from .base import PlatformResult

MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/'
}

class BilibiliResolver:
    def __init__(self, proxies: Optional[dict[str, str]] = None):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        if proxies:
            self.session.proxies.update(proxies)
        self._wbi_keys: Optional[tuple[str, str, float]] = None

    def _get_wbi_keys(self) -> tuple[str, str]:
        now = time.time()
        if self._wbi_keys and (now - self._wbi_keys[2]) < 7200:
            return self._wbi_keys[0], self._wbi_keys[1]

        try:
            endpoint = 'https://api.bilibili.com/x/web-interface/nav'
            response = self.session.get(endpoint, timeout=5)
            record('site_request', 'completed' if response.ok else 'failed', 'B 站 WBI 凭据', endpoint, response.status_code)
            resp = response.json()
            wbi_img = resp.get('data', {}).get('wbi_img', {})
            img_url = wbi_img.get('img_url', '')
            sub_url = wbi_img.get('sub_url', '')
            img_key = img_url.split('/')[-1].split('.')[0]
            sub_key = sub_url.split('/')[-1].split('.')[0]
            self._wbi_keys = (img_key, sub_key, now)
            return img_key, sub_key
        except Exception:
            record('site_request', 'failed', 'WBI 凭据获取失败，使用备用签名')
            return "7cd08448136d4844a5fc5e4b2f638308", "492b161900b24a4993bd970c2bd8d833"

    @staticmethod
    def _get_mixin_key(orig: str) -> str:
        return ''.join([orig[i] for i in MIXIN_KEY_ENC_TAB if i < len(orig)])[:32]

    def _enc_wbi(self, params: dict, img_key: str, sub_key: str) -> dict:
        mixin_key = self._get_mixin_key(img_key + sub_key)
        params['wts'] = round(time.time())
        params = dict(sorted(params.items()))
        query = urlencode(params)
        w_rid = hashlib.md5((query + mixin_key).encode()).hexdigest()
        params['w_rid'] = w_rid
        return params

    def extract_bvid_from_text(self, text: str) -> Optional[str]:
        clean = text.replace(" ", "")
        match = re.search(r'(BV1[0-9a-zA-Z]{9})', clean, re.IGNORECASE)
        if match:
            bvid = match.group(1)
            return "BV1" + bvid[3:]
        return None

    def get_video_by_bvid(self, bvid: str) -> Optional[PlatformResult]:
        url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
        try:
            resp = self.session.get(url, timeout=5).json()
            if resp.get('code') == 0:
                data = resp['data']
                title = data.get('title', '')
                author = data.get('owner', {}).get('name', '')
                pic = data.get('pic', '')
                video_url = f"https://www.bilibili.com/video/{bvid}"
                author_mid = data.get('owner', {}).get('mid', '')
                extra_urls = []
                if author_mid:
                    extra_urls.append({"name": f"UP主空间 ({author})", "url": f"https://space.bilibili.com/{author_mid}"})
                
                return PlatformResult(
                    platform="bilibili",
                    platform_name="哔哩哔哩 (Bilibili)",
                    title=title,
                    url=video_url,
                    author=author,
                    cover_url=pic,
                    confidence=0.99,
                    matched_method="bvid_direct",
                    extra_urls=extra_urls,
                    raw_details={
                        "bvid": bvid,
                        "view_count": data.get('stat', {}).get('view', 0),
                        "danmaku_count": data.get('stat', {}).get('danmaku', 0),
                        "pubdate": data.get('pubdate')
                    }
                )
        except Exception as e:
            print(f"Error fetching bvid {bvid}: {e}")
            return PlatformResult(
                platform="bilibili",
                platform_name="哔哩哔哩 (Bilibili)",
                title=f"B站视频 ({bvid})",
                url=f"https://www.bilibili.com/video/{bvid}",
                confidence=0.95,
                matched_method="bvid_regex",
                raw_details={"bvid": bvid}
            )
        return None

    def search_video(self, keyword: str, author_hint: Optional[str] = None,
                     max_queries: Optional[int] = None) -> Optional[PlatformResult]:
        if not keyword or len(keyword.strip()) < 2:
            return None

        # Clean search keyword
        search_query = keyword.strip()
        noise_words = [
            "哔哩哔哩", "bilibili", "B站", "点赞", "投币", "收藏", "分享", "关注", 
            "已关注", "UP主", "弹幕", "播放", "相关推荐", "广告", "推广", "接下来播放",
            "超清", "倍速", "正在播放", "发弹幕"
        ]
        for noise in noise_words:
            search_query = search_query.replace(noise, " ")
        search_query = " ".join(search_query.split())

        if len(search_query) < 2:
            search_query = keyword.strip()

        # Build candidate search queries (Priority order!)
        # 1. Exact cleaned full title (MUST BE FIRST)
        queries_to_try = [search_query]

        # 2. Punctuation turned into spaces
        clean_no_punc = re.sub(r'[:：|｜_—\-，,。？?！!]+', ' ', search_query).strip()
        if clean_no_punc and clean_no_punc != search_query and clean_no_punc not in queries_to_try:
            queries_to_try.append(clean_no_punc)

        # 3. Sentence clauses (split strictly by major punctuation delimiters, NEVER by space!)
        clause_parts = [p.strip() for p in re.split(r'[:：|｜_—\-，,。？?！!]+', search_query) if len(p.strip()) >= 4]
        for cp in clause_parts:
            if cp not in queries_to_try:
                queries_to_try.append(cp)

        try:
            img_key, sub_key = self._get_wbi_keys()
            
            seen_bvids = set()
            all_candidates = []

            search_status = "no_results"
            for q in queries_to_try[:max_queries]:
                if not q or len(q) < 2:
                    continue
                try:
                    params = self._enc_wbi({'keyword': q}, img_key, sub_key)
                    endpoint = 'https://api.bilibili.com/x/web-interface/wbi/search/all/v2'
                    response = self.session.get(endpoint, params=params, timeout=6)
                    record('site_request', 'completed' if response.ok else 'failed', f'B 站 WBI 搜索：{q[:80]}', endpoint, response.status_code)
                    if response.status_code == 412:
                        search_status = "blocked"
                        continue
                    response.raise_for_status()
                    resp = response.json()
                    if resp.get('code') != 0:
                        search_status = "blocked" if resp.get('code') in {-352, -412} else "failed"
                        continue
                    items = resp.get('data', {}).get('result', [])
                    for sec in items:
                        if sec.get('result_type') == 'video':
                            for v in sec.get('data', []):
                                bvid = v.get('bvid')
                                if bvid and bvid not in seen_bvids:
                                    seen_bvids.add(bvid)
                                    all_candidates.append(v)
                            break
                except Exception:
                    record('site_request', 'failed', f'B 站 WBI 搜索异常：{q[:80]}', 'https://api.bilibili.com/x/web-interface/wbi/search/all/v2')
                    search_status = "failed"

                # After query 1, if we already got >= 15 candidates, we have enough candidate pool
                if len(all_candidates) >= 20:
                    break

            if not all_candidates:
                return PlatformResult(
                    platform="bilibili", platform_name="哔哩哔哩 (Bilibili)",
                    title=f"搜索：{search_query}",
                    url=f"https://search.bilibili.com/all?keyword={quote(search_query)}",
                    confidence=0.0, matched_method="search_fallback",
                    raw_details={"search_status": search_status}, candidates=[])

            # Normalized representations for fuzzy & exact matching
            q_norm = re.sub(r'[\s\W_]+', '', search_query, flags=re.UNICODE).lower()
            a_hint_norm = re.sub(r'[\s\W_]+', '', author_hint, flags=re.UNICODE).lower() if author_hint else ""

            scored_candidates = []

            for v in all_candidates:
                raw_title = re.sub(r'<[^>]+>', '', v.get('title', ''))
                v_author = v.get('author', '')
                bvid = v.get('bvid', '')
                pic = v.get('pic', '')
                mid = v.get('mid', '')
                if pic and pic.startswith('//'):
                    pic = 'https:' + pic

                cand_norm = re.sub(r'[\s\W_]+', '', raw_title, flags=re.UNICODE).lower()
                v_author_norm = re.sub(r'[\s\W_]+', '', v_author, flags=re.UNICODE).lower()

                # Title scoring
                if q_norm == cand_norm:
                    title_score = 3.0  # Perfect normalized match
                elif q_norm in cand_norm or cand_norm in q_norm:
                    title_score = 2.0  # Substring match
                else:
                    title_score = difflib.SequenceMatcher(None, q_norm, cand_norm).ratio() * 1.5

                # Author scoring
                author_score = 0.0
                if a_hint_norm:
                    if a_hint_norm == v_author_norm:
                        author_score = 1.5  # Exact author match
                    elif a_hint_norm in v_author_norm or v_author_norm in a_hint_norm:
                        author_score = 1.0  # Substring author match
                    else:
                        aratio = difflib.SequenceMatcher(None, a_hint_norm, v_author_norm).ratio()
                        if aratio > 0.6:
                            author_score = aratio * 0.8

                total_score = title_score + author_score

                candidate_obj = {
                    "title": raw_title,
                    "author": v_author,
                    "mid": mid,
                    "bvid": bvid,
                    "url": f"https://www.bilibili.com/video/{bvid}",
                    "pic": pic,
                    "play": v.get('play', 0),
                    "pubdate": v.get('pubdate', 0),
                    "score": round(total_score, 3)
                }
                scored_candidates.append((total_score, candidate_obj))

            scored_candidates.sort(key=lambda x: x[0], reverse=True)
            best_score, best_cand = scored_candidates[0]

            # Calculate confidence based on matching score
            if best_score >= 2.8:
                confidence = 0.98
            elif best_score >= 2.0:
                confidence = 0.95
            elif best_score >= 1.5:
                confidence = 0.90
            elif best_score >= 1.0:
                confidence = 0.80
            elif best_score >= 0.7:
                confidence = 0.65
            else:
                confidence = 0.40

            extra_urls = []
            if best_cand.get('mid'):
                extra_urls.append({"name": f"UP主空间 ({best_cand['author']})", "url": f"https://space.bilibili.com/{best_cand['mid']}"})
            extra_urls.append({"name": "在B站搜索该内容", "url": f"https://search.bilibili.com/all?keyword={quote(search_query)}"})

            # Top sorted candidates
            top_candidates = [cand for _, cand in scored_candidates[:6]]

            return PlatformResult(
                platform="bilibili",
                platform_name="哔哩哔哩 (Bilibili)",
                title=best_cand['title'],
                url=best_cand['url'],
                author=best_cand['author'],
                cover_url=best_cand['pic'],
                confidence=confidence,
                matched_method="wbi_search",
                extra_urls=extra_urls,
                raw_details={
                    "bvid": best_cand['bvid'],
                    "play": best_cand['play'],
                    "pubdate": best_cand['pubdate'],
                    "search_keyword": search_query,
                    "best_score": round(best_score, 3)
                },
                candidates=top_candidates
            )

        except Exception as e:
            print(f"Error in Bilibili search: {e}")

        # Fallback to search query link
        return PlatformResult(
            platform="bilibili",
            platform_name="哔哩哔哩 (Bilibili)",
            title=f"搜索：{search_query}",
            url=f"https://search.bilibili.com/all?keyword={quote(search_query)}",
            author=author_hint,
            confidence=0.4,
            matched_method="search_fallback",
            candidates=[]
        )
