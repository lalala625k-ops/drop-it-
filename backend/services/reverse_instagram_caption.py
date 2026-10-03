"""Choose visible Instagram caption text from OCR without model inference."""

import re


_UI_TEXT = re.compile(
    r"^(?:instagram|reels?|explore|search|home|profile|follow(?:ing)?|message|"
    r"like(?:s|d)?|comment(?:s)?|share|save|view all|add a comment|"
    r"首页|搜索|关注|粉丝|点赞|评论|分享|收藏|查看全部|添加评论|发布于|翻译)$",
    re.I,
)
_STOP = re.compile(r"^(?:view all|add a comment|查看全部|添加评论|\d+\s*(?:comments?|条评论))", re.I)


def _clean(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def _usable(line: str) -> bool:
    value = _clean(line)
    return (len(value) >= 6 and not _UI_TEXT.fullmatch(value)
            and not re.fullmatch(r"[\d,\.\s]+", value)
            and not re.match(r"https?://|www\.", value, re.I))


def extract_instagram_caption(ocr: dict, author: str = "") -> str:
    """Prefer text beside the post author; use a substantial OCR line otherwise."""
    lines = [_clean(str(item.get("text") or "")) for item in ocr.get("lines") or []]
    if not lines:
        lines = [_clean(line) for line in str(ocr.get("text") or "").splitlines()]
    lines = [line for line in lines if line]
    handle = author.strip().lstrip("@").casefold()
    if handle:
        for index, line in enumerate(lines):
            match = re.match(rf"^@?{re.escape(handle)}(?:\s+|\s*[：:])(.+)$", line, re.I)
            if match and _usable(match.group(1)):
                return match.group(1)[:160]
            if line.casefold().lstrip("@") == handle:
                following = []
                for next_line in lines[index + 1:index + 4]:
                    if _STOP.match(next_line) or not _usable(next_line):
                        break
                    following.append(next_line)
                if following:
                    return " ".join(following)[:160]
    candidates = [line for line in lines if _usable(line) and not _STOP.match(line)]
    return max(candidates, key=len, default="")[:160]
