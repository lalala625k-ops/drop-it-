"""Build a user-opened search page when automatic image resolution has no link."""

import re
from urllib.parse import quote, urlparse

from backend.services.reverse_platforms.general import (
    DOMAIN_TO_PLATFORM_KEY, PLATFORM_SEARCH_TEMPLATES,
)


def _domain(value: str) -> str:
    domain = value.casefold().strip().removeprefix("www.")
    return domain if re.fullmatch(r"(?:[a-z0-9-]+\.)+[a-z]{2,}", domain) else ""


def build_manual_search(clues: dict | None, ocr_text: str = "") -> dict | None:
    fields = clues or {}
    title = str(fields.get("title") or "").strip()[:120]
    author = str(fields.get("author") or "").strip()[:60]
    suggested = str(fields.get("search_query") or "").strip()[:120]
    if author and suggested:
        suggested = re.sub(re.escape(author), "", suggested, flags=re.I).strip()
    if title:
        query = title
    elif suggested:
        query = suggested
    else:
        query = next((line.strip()[:80] for line in ocr_text.splitlines()
                      if len(line.strip()) >= 4 and line.strip().casefold() != author.casefold()), "")
    platform = str(fields.get("platform") or "").casefold().strip()
    domain = _domain(str(fields.get("site_domain") or ""))
    if platform == "instagram" or domain == "instagram.com":
        # Instagram's hashtag page cannot search a post's caption text.
        endpoint = "https://cn.bing.com/search?q=" if re.search(r"[\u4e00-\u9fff]", query) else "https://www.bing.com/search?q="
        return {"url": endpoint + quote(f"site:instagram.com {query}", safe=""),
                "query": query, "platform": "Instagram", "kind": "domain"}
    if platform not in PLATFORM_SEARCH_TEMPLATES:
        platform = DOMAIN_TO_PLATFORM_KEY.get(domain, "")
    config = PLATFORM_SEARCH_TEMPLATES.get(platform)
    if config:
        platform_domain = _domain(str(config.get("domain") or ""))
        template = str(config.get("search_url") or "")
        parsed = urlparse(template)
        host = _domain(parsed.hostname or "")
        # Only use a platform's own search page. WeChat's Sogou search is its
        # established public search entry; other third-party templates fall back.
        direct = parsed.scheme == "https" and (
            host == platform_domain or host.endswith("." + platform_domain)
            if platform_domain else False)
        if platform == "wechat" and host == "weixin.sogou.com":
            direct = True
        if direct and "{query}" in template:
            return {"url": template.format(query=quote(query, safe="")),
                    "query": query, "platform": str(config.get("badge") or platform),
                    "kind": "site"}
        domain = domain or platform_domain

    if domain:
        return {"url": "https://www.bing.com/search?q=" + quote(f"site:{domain} {query}", safe=""),
                "query": query, "platform": domain, "kind": "domain"}
    return {"url": "https://www.bing.com/search?q=" + quote(query, safe=""),
            "query": query, "platform": "网页", "kind": "web"}
