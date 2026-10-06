"""Focused reverse lookups for supported content platforms."""

import html
import re
from difflib import SequenceMatcher
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}


def _compact(value: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", html.unescape(value), flags=re.UNICODE).casefold()


def _same_title(expected: str, candidate: str) -> bool:
    """Require a continuous phrase plus strong total similarity."""
    left, right = _compact(expected), _compact(candidate)
    if len(left) < 8 or len(right) < 8:
        return False
    overlap = SequenceMatcher(None, left, right, autojunk=False)
    longest = overlap.find_longest_match(0, len(left), 0, len(right)).size
    return longest >= 5 and (overlap.ratio() >= 0.72 or
                             (longest >= 10 and longest / min(len(left), len(right)) >= 0.8))


def _official(url: str, domain: str, path: str) -> str | None:
    parsed = urlparse(url)
    if parsed.scheme == "https" and parsed.hostname == domain and re.search(path, parsed.path):
        return url
    return None


def _wechat(title: str, author: str, proxies: dict | None) -> str | None:
    # Generate WeChat query candidates and unpack Sogou JavaScript redirects.
    clauses = [part for part in re.split(r"[，,。；;：:!！?？|—\-_]+", title) if len(_compact(part)) >= 3]
    queries = []
    if len(clauses) >= 2:
        queries.append(_compact(clauses[0])[:8] + _compact(clauses[1])[:8])
    queries.append(_compact(title)[:18])
    session = requests.Session()
    session.headers.update(HEADERS)
    for query in list(dict.fromkeys(queries))[:2]:
        try:
            response = session.get("https://weixin.sogou.com/weixin",
                                   params={"type": 2, "s_from": "input", "query": query,
                                           "ie": "utf8", "_sug_": "n", "_sug_type_": ""},
                                   proxies=proxies, timeout=4)
            if "antispider" in response.text.casefold():
                continue
            soup = BeautifulSoup(response.text, "html.parser")
            for item in soup.select("div.txt-box")[:6]:
                anchor = item.select_one("h3 a[href]")
                if not anchor or not _same_title(title, anchor.get_text(" ", strip=True)):
                    continue
                publisher = item.select_one(".s-p a, a.account")
                if author and publisher and _compact(publisher.get_text(" ", strip=True)) != _compact(author):
                    continue
                target = urljoin("https://weixin.sogou.com", anchor["href"])
                if not target.startswith("https://weixin.sogou.com/link?"):
                    continue
                resolved = session.get(target, headers={"Referer": response.url},
                                       proxies=proxies, timeout=4)
                direct = _official(resolved.url, "mp.weixin.qq.com", r"^/s(?:/|$)")
                if direct:
                    return direct
                parts = re.findall(r"url\s*\+=\s*'([^']+)'", resolved.text)
                reconstructed = "".join(parts).replace("@", "")
                direct = _official(reconstructed, "mp.weixin.qq.com", r"^/s(?:/|$)")
                if direct:
                    return direct
        except (requests.RequestException, ValueError):
            continue
    return None


def _sspai(title: str, author: str, proxies: dict | None) -> str | None:
    # Use the site's article search API for exact Sspai article matches.
    segments = [part.strip() for part in re.split(r"[:：,，_—\-]+", title) if len(_compact(part)) >= 4]
    queries = list(dict.fromkeys([title[:30], *(part[:20] for part in segments[:1])]))
    for query in queries:
        try:
            response = requests.get("https://sspai.com/api/v1/search",
                                    params={"keyword": query, "type": "article", "limit": 10, "offset": 0},
                                    headers=HEADERS, proxies=proxies, timeout=4)
            response.raise_for_status()
            payload = response.json()
            items = payload.get("data") or payload.get("list") or []
            if isinstance(items, dict):
                items = items.get("list") or items.get("items") or []
            if not isinstance(items, list):
                continue
            for item in items:
                post_id = item.get("id")
                found_title = str(item.get("title") or "")
                found_author = str((item.get("author") or {}).get("nickname") or "")
                if str(post_id).isdigit() and _same_title(title, found_title):
                    if author and found_author and _compact(author) != _compact(found_author):
                        continue
                    return f"https://sspai.com/post/{post_id}"
        except (requests.RequestException, ValueError, TypeError, AttributeError):
            continue
    return None


def recover_platform_link(platform: str, title: str, author: str, proxies: dict | None) -> str | None:
    if platform == "wechat":
        return _wechat(title, author, proxies)
    if platform == "sspai":
        return _sspai(title, author, proxies)
    return None
