"""Run platform resolvers under the board's direct-link contract."""

import re
from urllib.parse import parse_qs, urlparse

import requests
from bs4 import BeautifulSoup

from backend.services.reverse_platform_service import _same_title
from backend.services.reverse_platforms import (
    BilibiliResolver, FeishuResolver, GeneralResolver, SspaiResolver,
    ThePaperResolver, TwitterResolver, WechatResolver, WeiboResolver,
    XiaohongshuResolver, YouTubeResolver, ZhihuResolver,
)


DIRECT_METHODS = {
    "bvid_direct", "bvid_regex", "wbi_search", "tweet_id_direct",
    "youtube_id_direct", "youtube_direct_scrape", "feishu_doc_direct",
    "zhihu_url_direct", "zhihu_id_direct", "zhihu_exact_post_direct",
    "sspai_url_direct", "sspai_id_direct", "sspai_post_direct",
    "thepaper_url_direct", "thepaper_id_direct", "thepaper_article_direct",
    "wechat_url_direct", "wechat_direct", "direct_url_in_image",
}
SEARCH_METHODS_WITH_CANDIDATE_TITLE = {"wbi_search", "youtube_direct_scrape"}


def _candidate_title(url: str, proxies: dict | None) -> str:
    """Read a candidate title only after the caller has checked its domain."""
    try:
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"},
                                proxies=proxies, timeout=4)
        response.raise_for_status()
        if urlparse(response.url).hostname != urlparse(url).hostname:
            return ""
        soup = BeautifulSoup(response.text[:300_000], "html.parser")
        meta = soup.select_one('meta[property="og:title"], meta[name="twitter:title"]')
        return (meta.get("content", "") if meta else "") or (soup.title.get_text(" ", strip=True) if soup.title else "")
    except (requests.RequestException, ValueError):
        return ""


def recover_imported_link(platform: str, title: str, author: str, text: str,
                          domain: str, proxies: dict | None, found_id: str = "") -> str | None:
    """Dispatch platform resolvers; reject search-page fallback results."""
    try:
        if platform == "bilibili":
            resolver = BilibiliResolver()
            result = (resolver.get_video_by_bvid(found_id) if re.fullmatch(r"BV[0-9A-Za-z]{10}", found_id, re.I)
                      else None) or resolver.search_video(title, max_queries=2)
        elif platform == "twitter":
            result = TwitterResolver().resolve(text, handle=author.lstrip("@") or None,
                                               status_id=found_id if found_id.isdigit() else None)
        elif platform == "xiaohongshu":
            result = XiaohongshuResolver().resolve(text, author=author or None, title=title)
        elif platform == "weibo":
            result = WeiboResolver().resolve(text, author=author or None, title=title)
        elif platform == "youtube":
            result = YouTubeResolver(proxies).search_video(title)
        elif platform == "feishu":
            result = FeishuResolver().resolve(text, title=title, author=author or None)
        elif platform == "zhihu":
            result = ZhihuResolver().resolve(text, title=title, author=author or None,
                                             found_id=found_id or None)
        elif platform == "sspai":
            result = SspaiResolver().resolve(text, title=title, author=author or None,
                                             found_id=found_id or None)
        elif platform == "thepaper":
            result = ThePaperResolver().resolve(text, title=title, author=author or None,
                                                found_id=found_id or None)
        elif platform == "wechat":
            result = WechatResolver().resolve(text, title=title, author=author or None)
        else:
            result = GeneralResolver().resolve(text, title=title,
                                               platform_id=platform, site_domain=domain,
                                               found_id=found_id or None)
    except Exception:
        return None

    if not result or not result.url or (result.matched_method not in DIRECT_METHODS
                                      and not result.matched_method.endswith("_direct_article")):
        return None
    url = result.url
    host = (urlparse(url).hostname or "").casefold()
    domain = domain.casefold().removeprefix("www.")
    if not url.startswith("https://") or not domain or (host != domain and not host.endswith("." + domain)):
        return None
    if result.matched_method == "direct_url_in_image":
        return url if url in text else None
    # WeChat's Sogou resolver already matched the article title before
    # unpacking the signed mp.weixin.qq.com redirect. Fetching that signed
    # URL again often returns an anti-bot page, which used to discard a valid
    # result and incorrectly fall through to Bing domain search.
    if result.matched_method in {"wechat_direct", "wechat_url_direct"}:
        return url
    if result.matched_method in {"bvid_direct", "bvid_regex", "tweet_id_direct", "youtube_id_direct",
                                 "feishu_doc_direct", "zhihu_id_direct", "sspai_id_direct", "thepaper_id_direct"}:
        # A visible identifier or URL is sufficient; inferred IDs are not.
        parsed = urlparse(url)
        identifier = parse_qs(parsed.query).get("v", [""])[0] or parsed.path.rstrip("/").rsplit("/", 1)[-1]
        if result.matched_method == "tweet_id_direct":
            handle = parsed.path.strip("/").split("/")[0]
            if f"@{handle}" not in text and f"/{handle}/status/" not in text:
                return None
        if url in text or (len(identifier) >= 8 and identifier in text):
            return url
        found_title = result.title if result.matched_method in {"bvid_direct", "bvid_regex"} else _candidate_title(url, proxies)
        return url if _same_title(title, found_title) else None
    if result.matched_method in SEARCH_METHODS_WITH_CANDIDATE_TITLE:
        if author and result.author and _same_author(author, result.author) is False:
            return None
        return url if _same_title(title, result.title) else None
    found_title = _candidate_title(url, proxies)
    return url if _same_title(title, found_title) else None


def _same_author(expected: str, actual: str) -> bool:
    return re.sub(r"\W+", "", expected, flags=re.UNICODE).casefold() == \
        re.sub(r"\W+", "", actual, flags=re.UNICODE).casefold()
