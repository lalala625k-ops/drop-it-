"""Correct model platform labels only when OCR shows site-owned page copy."""

import re


def sspai_matrix_page(ocr_text: str) -> bool:
    text = re.sub(r"\s+", "", ocr_text).casefold()
    return ("matrix首页推荐" in text and
            ("matrix是少数派的写作社区" in text or
             "少数派仅对标题和排版" in text))
