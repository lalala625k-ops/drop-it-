"""Correct model platform labels only when OCR shows site-owned page copy."""

import re


_WECHAT_DATE = re.compile(r"20\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*\d{1,2}\s*[:：]\s*\d{2}")
_REGION = re.compile(
    r"北京|天津|河北|山西|内蒙古|辽宁|吉林|黑龙江|上海|江苏|浙江|安徽|福建|江西|山东|河南|"
    r"湖北|湖南|广东|广西|海南|重庆|四川|贵州|云南|西藏|陕西|甘肃|青海|宁夏|新疆|香港|澳门|台湾|海外")


def _compact(value: str) -> str:
    return re.sub(r"\W+", "", value).casefold()


def wechat_article_clues(ocr: dict) -> dict[str, str] | None:
    """Require outer article geometry, not words inside an embedded screenshot."""
    width, height = ocr.get("width") or 0, ocr.get("height") or 0
    if not width or not height:
        return None
    blocks = []
    for item in ocr.get("lines") or []:
        box, text = item.get("box") or [], str(item.get("text") or "").strip()
        if not text or len(box) < 4:
            continue
        xs, ys = [p[0] for p in box], [p[1] for p in box]
        blocks.append({"text": text, "x": min(xs), "y": min(ys),
                       "bottom": max(ys), "height": max(ys) - min(ys)})
    # WeChat's date/time and IP location sit below the title, near the top.
    for date in blocks:
        if date["y"] > height * 0.32:
            continue
        row = sorted((b for b in blocks if abs(b["y"] - date["y"]) <= max(date["height"], b["height"]) * 0.7),
                     key=lambda b: b["x"])
        row_text = " ".join(b["text"] for b in row)
        match = _WECHAT_DATE.search(row_text)
        if not match or not _REGION.search(row_text[match.end():]):
            continue
        # A title must be physically above this row and noticeably larger.
        headings = sorted((b for b in blocks if b["bottom"] <= date["y"] and
                           date["y"] - b["bottom"] <= height * 0.22 and
                           b["height"] >= date["height"] * 1.15 and len(_compact(b["text"])) >= 6),
                          key=lambda b: (b["y"], b["x"]))
        if not headings:
            continue
        # The publisher is also shown at the bottom, outside the article body.
        footer = "".join(_compact(b["text"]) for b in blocks if b["y"] >= height * 0.86)
        names = []
        for b in row:
            date_match = _WECHAT_DATE.search(b["text"])
            prefix = b["text"][:date_match.start()] if date_match else b["text"]
            for name in re.split(r"\s+", re.sub(r"原创|已关注|关注", " ", prefix)):
                if 2 <= len(_compact(name)) <= 24 and not re.search(r"\d|[:：]", name):
                    names.append(name)
        publisher = next((name for name in names if _compact(name) in footer), "")
        if not publisher:
            continue
        title = "".join(b["text"] for b in headings)
        return {"platform": "wechat", "platform_name": "微信公众号", "site_domain": "mp.weixin.qq.com",
                "title": title, "author": publisher, "breadcrumb": "", "distinctive_text": "",
                "id": "", "search_query": title}
    return None


def sspai_matrix_page(ocr_text: str) -> bool:
    text = re.sub(r"\s+", "", ocr_text).casefold()
    return ("matrix首页推荐" in text and
            ("matrix是少数派的写作社区" in text or
             "少数派仅对标题和排版" in text))
