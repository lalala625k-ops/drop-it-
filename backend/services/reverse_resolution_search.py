"""Search a model-identified site and retain concrete, reviewable results."""

import re
import base64
from difflib import SequenceMatcher
from urllib.parse import parse_qs, urlsplit

import requests
from bs4 import BeautifulSoup

from backend.services.reverse_platform_adapter import recover_imported_link
from backend.services.reverse_platform_service import recover_platform_link
from backend.services.reverse_platforms import BilibiliResolver, YouTubeResolver
from backend.services.bilibili_reverse_service import _search_page
from backend.services.reverse_search_service import PLATFORMS, _source_url
from backend.services.screenshot_service import detect_local_proxy
from backend.services.reverse_trace import record
from backend.services.reverse_xiaohongshu_search import search_public_page


def _compact(value: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", value, flags=re.UNICODE).casefold()


def search_target(clues: dict[str, str]) -> tuple[str, str] | None:
    platform = clues.get("platform", "").casefold().strip()
    domain = clues.get("site_domain", "").casefold().strip().removeprefix("www.")
    # A recognized site domain is more reliable for routing than a broad model label.
    domain_platforms = {"mp.weixin.qq.com": "wechat", "x.com": "twitter", "twitter.com": "twitter",
                        "xiaohongshu.com": "xiaohongshu", "instagram.com": "instagram"}
    if domain in domain_platforms:
        platform = domain_platforms[domain]
    elif platform == "niche_site":
        platform = "general"
    if platform in PLATFORMS:
        return platform, PLATFORMS[platform][0]
    if not re.fullmatch(r"(?:[a-z0-9-]+\.)+[a-z]{2,}", domain):
        return None
    if domain.endswith((".local", ".localhost")):
        return None
    return "general", domain


def _candidate(url: str, title: str, author: str, source: str,
               expected_title: str, expected_author: str, platform: str,
               domain: str) -> dict | None:
    valid = _source_url(url, platform, domain)
    left, right = _compact(expected_title), _compact(title)
    if not valid or len(left) < 6 or len(right) < 6:
        return None
    similarity = SequenceMatcher(None, left, right, autojunk=False)
    score = similarity.ratio()
    longest = similarity.find_longest_match(0, len(left), 0, len(right)).size
    author_match = bool(expected_author and author and _compact(expected_author) == _compact(author))
    if longest < 5 or (score < 0.45 and not author_match):
        return None
    exact_prefix = (author_match and len(left) >= 24 and right.startswith(left)
                    and len(left) / len(right) >= 0.45)
    return {"url": valid, "title": title, "author": author,
            "source": source, "score": round(score, 3),
            "author_match": author_match,
            "auto_match": (exact_prefix or score >= (0.88 if author_match else 0.95))
            and not (expected_author and author and not author_match)}


def _proxies() -> dict[str, str] | None:
    proxy = detect_local_proxy()
    return {"http": proxy, "https": proxy} if proxy else None


def _search_result_url(href: str) -> str:
    """Bing wraps result URLs in /ck/a links; unwrap only for later domain checks."""
    parsed = urlsplit(href)
    if parsed.hostname != "www.bing.com" or parsed.path != "/ck/a":
        return href
    encoded = parse_qs(parsed.query).get("u", [""])[0]
    if not encoded.startswith("a1"):
        return href
    try:
        return base64.urlsafe_b64decode(encoded[2:] + "===").decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return href


def search_platform(clues: dict[str, str], ocr_text: str) -> tuple[list[dict], str]:
    target = search_target(clues)
    if not target:
        return [], "unsupported"
    platform, domain = target
    title, author = clues.get("title", "").strip(), clues.get("author", "").strip()
    if not title:
        return [], "missing_title"
    if platform == "bilibili":
        proxies = _proxies()
        resolver = BilibiliResolver(proxies)
        result = resolver.search_video(title, max_queries=2)
        raw = (result.candidates or ([{"url": result.url, "title": result.title,
                                      "author": result.author or ""}]
                                    if result.matched_method == "wbi_search" else [])) if result else []
        if not raw:
            headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/"}
            for query in [title[:24]]:
                if not query:
                    continue
                page = _search_page(query, 1, headers, proxies, None)
                if page:
                    raw.extend({"url": f"https://www.bilibili.com/video/{item.get('bvid', '')}",
                                "title": BeautifulSoup(str(item.get("title") or ""), "html.parser").get_text(),
                                "author": str(item.get("author") or "")}
                               for item in (page.get("result") or [])[:12])
                if raw:
                    break
        candidates = [_candidate(str(item.get("url") or ""), str(item.get("title") or ""),
                                 str(item.get("author") or ""), "site", title, author,
                                 platform, domain) for item in raw[:12]]
        return [item for item in candidates if item], ("completed" if raw else
            str(result.raw_details.get("search_status") or "no_results") if result else "no_results")

    if platform == "youtube":
        result = YouTubeResolver(_proxies()).search_video(title, author_hint=author or None)
        raw = result.candidates if result else []
        record("site_request", "completed" if raw else "no_results",
               f"YouTube 站内搜索（仅标题）：{title[:80]}", "https://www.youtube.com/results")
        candidates = [_candidate(str(item.get("url") or ""), str(item.get("title") or ""),
                                 str(item.get("author") or ""), "site", title, author,
                                 platform, domain) for item in raw]
        accepted = [item for item in candidates if item]
        record("site_results", "completed" if accepted else "no_results",
               f"YouTube 返回 {len(raw)} 条视频；标题核验通过 {len(accepted)} 条")
        return accepted, "completed" if accepted else "no_results"

    if platform == "sspai":
        endpoint = "https://sspai.com/api/v1/search"
        segments = [part.strip() for part in re.split(r"[:：,，_—\-]+", title)
                    if len(_compact(part)) >= 4]
        queries = list(dict.fromkeys([title[:30], *(part[:24] for part in segments[:2])]))[:2]
        had_response = False
        for query in queries:
            try:
                response = requests.get(endpoint,
                                        params={"keyword": query, "type": "article", "limit": 15, "offset": 0},
                                        headers={"User-Agent": "Mozilla/5.0", "Referer": "https://sspai.com/",
                                                 "Accept": "application/json, text/plain, */*"},
                                        proxies=_proxies(), timeout=6)
                record("site_request", "completed" if response.ok else "failed",
                       f"少数派文章搜索（仅标题）：{query}", endpoint, response.status_code)
                response.raise_for_status()
                had_response = True
                payload = response.json()
                raw = payload.get("list") or payload.get("data") or []
                if isinstance(raw, dict):
                    raw = raw.get("list") or raw.get("items") or []
                if not isinstance(raw, list):
                    raw = []
                candidates = []
                for item in raw[:15]:
                    if not isinstance(item, dict) or not str(item.get("id") or "").isdigit():
                        continue
                    url = f"https://sspai.com/post/{item['id']}"
                    found_title = str(item.get("title") or "")
                    found_author = str((item.get("author") or {}).get("nickname") or "")
                    candidate = _candidate(url, found_title, found_author, "site", title,
                                           author, platform, domain)
                    if not candidate:
                        left, right = _compact(title), _compact(found_title)
                        similarity = SequenceMatcher(None, left, right, autojunk=False)
                        if len(left) < 6 or len(right) < 6 or similarity.ratio() < 0.3 or \
                                similarity.find_longest_match(0, len(left), 0, len(right)).size < 4:
                            continue
                        candidate = {"url": url, "title": found_title, "author": found_author,
                                     "source": "site", "score": round(similarity.ratio(), 3),
                                     "author_match": bool(author and found_author and
                                                          _compact(author) == _compact(found_author)),
                                     "auto_match": False}
                    candidates.append(candidate)
                record("site_results", "completed" if candidates else "no_results",
                       f"少数派返回 {len(raw)} 条文章；标题核验后保留 {len(candidates)} 条")
                if candidates:
                    return candidates, "completed"
            except (requests.RequestException, ValueError, TypeError, AttributeError):
                record("site_request", "failed", "少数派文章搜索请求或响应解析失败", endpoint)
        return [], "no_results" if had_response else "failed"

    if platform == "github":
        endpoint = "https://api.github.com/search/repositories"
        queries = [title[:80]]
        if "/" in title:
            queries.append(title.rsplit("/", 1)[-1][:60])
        for query in dict.fromkeys(queries):
            try:
                response = requests.get(endpoint, params={"q": query, "per_page": 15},
                                        headers={"Accept": "application/vnd.github+json",
                                                 "User-Agent": "InfiniteCanvasNote/1.0"},
                                        proxies=_proxies(), timeout=7)
                record("site_request", "completed" if response.ok else "failed",
                       f"GitHub 仓库搜索（仅标题）：{query[:80]}", endpoint, response.status_code)
                if response.status_code in {403, 429}:
                    return [], "rate_limited"
                response.raise_for_status()
                raw = response.json().get("items") or []
                candidates = []
                for item in raw:
                    url = _source_url(str(item.get("html_url") or ""), platform, domain)
                    if not url:
                        continue
                    labels = [str(item.get("name") or ""), str(item.get("full_name") or ""),
                              str(item.get("description") or "")]
                    expected = _compact(title)
                    name_score = max((SequenceMatcher(None, expected, _compact(label), autojunk=False).ratio()
                                      for label in labels[:2] if label), default=0.0)
                    description_score = (SequenceMatcher(None, expected, _compact(labels[2]), autojunk=False).ratio()
                                         if labels[2] else 0.0)
                    score = max(name_score, description_score)
                    owner = str((item.get("owner") or {}).get("login") or "")
                    author_match = bool(author and owner and _compact(author) == _compact(owner))
                    if score < 0.42:
                        continue
                    candidates.append({"url": url, "title": labels[1] or labels[0],
                                       "author": owner, "source": "site", "score": round(score, 3),
                                       "author_match": author_match,
                                       "auto_match": name_score >= 0.94 and author_match})
                record("site_results", "completed" if candidates else "no_results",
                       f"GitHub 返回 {len(raw)} 条仓库；标题核验通过 {len(candidates)} 条")
                if candidates:
                    return candidates, "completed"
            except (requests.RequestException, ValueError, TypeError):
                record("site_request", "failed", "GitHub 仓库搜索请求失败", endpoint)
                return [], "failed"
        return [], "no_results"

    if platform == "xiaohongshu":
        raw, status = search_public_page(title, _proxies())
        candidates = []
        for item in raw:
            candidate = _candidate(item["url"], item["title"], item["author"],
                                   "site", title, author, platform, domain)
            if candidate:
                candidate["auto_match"] = False  # Public search-page order is not proof.
                candidates.append(candidate)
            else:
                candidates.append({"url": item["url"], "title": item["title"],
                                   "author": item["author"], "source": "site", "score": 0.0,
                                   "author_match": False, "auto_match": False})
        return candidates, status

    proxies = _proxies()
    direct = recover_platform_link(platform, title, author, proxies)
    if not direct:
        # A model-supplied ID is deliberately excluded: it is not visible proof.
        direct = recover_imported_link(platform, title, author, ocr_text,
                                       domain, proxies, "")
    if not direct or not _source_url(direct, platform, domain):
        return [], "unavailable" if platform in {"twitter", "xiaohongshu"} else "no_results"
    return [{"url": direct, "title": title, "author": author, "source": "site",
             "score": 1.0, "author_match": bool(author), "auto_match": True}], "completed"


def search_domain(clues: dict[str, str]) -> tuple[list[dict], str]:
    target = search_target(clues)
    if not target:
        return [], "unsupported"
    platform, domain = target
    title, author = clues.get("title", "").strip(), clues.get("author", "").strip()
    if not title:
        return [], "missing_title"
    queries = [f'site:{domain} "{title[:65]}"']
    if len(title) > 35:
        queries.append(f'site:{domain} "{title[:35]}"')
    candidates: list[dict] = []
    errors = 0
    ignored_site = 0
    attempts = list(dict.fromkeys(queries))[:2]
    proxies = _proxies()
    # Bing's default market can ignore Chinese site: queries and return unrelated sites.
    endpoint = ("https://cn.bing.com/search" if re.search(r"[\u4e00-\u9fff]", title)
                else "https://www.bing.com/search")
    for query in attempts:
        try:
            response = requests.get(endpoint, params={"q": query},
                                    headers={"User-Agent": "Mozilla/5.0"},
                                    proxies=proxies, timeout=6)
            record("domain_request", "completed" if response.ok else "failed", query[:160], endpoint, response.status_code)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            raw_count = 0
            wrong_domain = 0
            non_content = 0
            title_rejected = 0
            rejected_examples: list[str] = []
            for result in soup.select("li.b_algo")[:12]:
                anchor = result.select_one("h2 a[href]")
                if not anchor:
                    continue
                raw_count += 1
                result_url = _search_result_url(anchor.get("href", ""))
                result_host = (urlsplit(result_url).hostname or "").casefold()
                if result_host != domain and not result_host.endswith("." + domain) and not (
                    platform == "twitter" and result_host in {"twitter.com", "www.twitter.com", "mobile.twitter.com"}
                ):
                    wrong_domain += 1
                    if len(rejected_examples) < 2:
                        rejected_examples.append(result_host or "无法解出目标网址")
                    continue
                if not _source_url(result_url, platform, domain):
                    non_content += 1
                    if len(rejected_examples) < 2:
                        rejected_examples.append(f"{result_host}{urlsplit(result_url).path[:80]}")
                    continue
                candidate = _candidate(result_url,
                                       anchor.get_text(" ", strip=True), "", "domain",
                                       title, author, platform, domain)
                if candidate:
                    candidates.append(candidate)
                else:
                    title_rejected += 1
            status = "completed" if candidates else "site_ignored" if raw_count and wrong_domain == raw_count else "no_results"
            if status == "site_ignored":
                ignored_site += 1
            record("domain_results", status,
                   f"搜索列表 {raw_count} 条；跨站结果 {wrong_domain} 条；站内非内容页 {non_content} 条；"
                   f"标题不符 {title_rejected} 条；已通过核验 {len(candidates)} 条"
                   + (f"；排除示例：{', '.join(rejected_examples)}" if rejected_examples else ""))
        except requests.RequestException:
            record("domain_request", "failed", query[:160], endpoint)
            errors += 1
    return candidates, ("failed" if errors == len(attempts) else "completed" if candidates else
                        "site_ignored" if ignored_site and ignored_site + errors == len(attempts) else "no_results")


def rank_candidates(items: list[dict]) -> list[dict]:
    unique: dict[str, dict] = {}
    for item in items:
        url = item["url"]
        if url not in unique or item["score"] > unique[url]["score"]:
            unique[url] = item
    return sorted(unique.values(), key=lambda item: (item["auto_match"], item["score"]),
                  reverse=True)[:5]
