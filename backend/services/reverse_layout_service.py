"""OCR geometry extraction helpers."""

import math
import re
from typing import Any, Dict, List

from backend.services.reverse_platforms.bilibili import BilibiliResolver
from backend.services.reverse_platforms.twitter import TwitterResolver


class TextBlock:
    def __init__(self, text: str, box: list, score: float, img_w: int, img_h: int):
        self.text = text.strip()
        self.box = box
        self.score = float(score) if score else 0.0
        
        # Calculate geometric properties
        xs = [pt[0] for pt in box]
        ys = [pt[1] for pt in box]
        self.x_min, self.x_max = min(xs), max(xs)
        self.y_min, self.y_max = min(ys), max(ys)
        
        self.x_center = (self.x_min + self.x_max) / 2
        self.y_center = (self.y_min + self.y_max) / 2
        self.w = max(1.0, self.x_max - self.x_min)
        self.h = max(1.0, self.y_max - self.y_min)
        
        # Normalized relative coordinates (0.0 ~ 1.0)
        self.rel_x = self.x_center / max(1, img_w)
        self.rel_y = self.y_center / max(1, img_h)
        self.rel_h = self.h / max(1, img_h)
        self.rel_w = self.w / max(1, img_w)


class ReverseLayoutEngine:
    def __init__(self):
        self.bili_resolver = BilibiliResolver()
        self.twitter_resolver = TwitterResolver()

    def extract_layout_aware_entities(self, blocks: List[TextBlock], img_w: int, img_h: int) -> Dict[str, Any]:
        """
        Spatial Layout Analysis:
        Distinguishes mobile vertical UI vs desktop horizontal UI.
        Crucially discards bottom recommendation feeds, sidebar related videos, and ad banners.
        """
        is_vertical = img_h >= img_w
        max_h = max([b.h for b in blocks], default=1.0)
        
        # Obvious noise words to strictly eliminate from title/author
        noise_keywords = [
            "广告", "推广", "商单", "相关推荐", "接下来播放", "大家都在搜", 
            "热门推荐", "发弹幕", "点赞", "投币", "收藏", "分享", "已关注", 
            "关注", "万播放", "万弹幕", "播放", "弹幕", "次观看", "查看详情", 
            "立即下载", "打开App", "APP内打开", "超清", "倍速", "正在播放", "评论",
            "转发", "转发微博", "条回复", "赞", "回复", "只看楼主", "返回", "设置",
            "选集", "弹幕列表", "合集和系列", "UP主更多视频"
        ]

        title_candidates = []
        author_candidates = []
        detected_bvid = None
        detected_handle = None

        # Check for explicit BV id or handle across all blocks first
        for b in blocks:
            if not detected_bvid:
                bv = self.bili_resolver.extract_bvid_from_text(b.text)
                if bv:
                    detected_bvid = bv
            if not detected_handle and "@" in b.text:
                h = self.twitter_resolver.extract_handle(b.text)
                if h:
                    detected_handle = h

        # Pass 1: Extract UP主 / Author FIRST
        # In B站 mobile UI, the author is ALWAYS on the same line as "+ 关注" or has "UP:" prefix
        detected_author = None
        author_block_ref = None

        follow_blocks = [b for b in blocks if "关注" in b.text and "已关注" not in b.text]
        for b in blocks:
            # Check explicit UP label
            m = re.match(r'^(UP|UP主)[:：\s]*(.+)', b.text, re.IGNORECASE)
            if m:
                name = m.group(2).strip()
                # Clean BV number if attached to UP line (e.g. UP: xxx BV1...)
                name = re.sub(r'BV1[0-9a-zA-Z]{9}', '', name).strip()
                if name and len(name) <= 16:
                    detected_author = name
                    author_block_ref = b
                    break

        if not detected_author:
            for fb in follow_blocks:
                for b in blocks:
                    if b != fb and abs(b.rel_y - fb.rel_y) < 0.04 and b.x_center < fb.x_center:
                        clean_t = re.sub(r'^(UP|UP主)[:：\s]*', '', b.text).strip()
                        clean_t = re.sub(r'BV1[0-9a-zA-Z]{9}', '', clean_t).strip()
                        if clean_t not in ["关注", "+", "已关注"] and 2 <= len(clean_t) <= 16:
                            detected_author = clean_t
                            author_block_ref = b
                            break
                if detected_author:
                    break

        # Pass 2: Filter and score blocks for Main Title (EXCLUDING Author)
        for b in blocks:
            # Strictly exclude author block
            if b == author_block_ref or (detected_author and detected_author in b.text and len(b.text) <= len(detected_author) + 4):
                continue

            # Skip noise words
            if any(nw in b.text for nw in noise_keywords):
                continue
            # Skip tiny numbers, pure symbols or status bar lines
            if len(b.text) < 3 or re.match(r'^[\d\.:\s%/-]+$', b.text):
                continue

            rel_y = b.rel_y
            rel_x = b.rel_x
            rel_h = b.rel_h

            if is_vertical:
                # MOBILE SCREENSHOT:
                if rel_y < 0.08 or rel_y > 0.56:
                    continue
                # In B站, video title is strictly ABOVE or near author line
                if author_block_ref and (rel_y > author_block_ref.rel_y + 0.05):
                    continue

                font_weight = (b.h / max_h) ** 1.8
                pos_weight = math.exp(-((rel_y - 0.35) ** 2) / 0.035)
                length_weight = min(1.0, len(b.text) / 10.0)

                total_score = font_weight * 0.55 + pos_weight * 0.35 + length_weight * 0.10
                title_candidates.append((b, total_score, rel_y))

            else:
                # DESKTOP SCREENSHOT:
                if rel_x > 0.70 or rel_y > 0.75 or rel_y < 0.03:
                    continue

                font_weight = (b.h / max_h) ** 1.8
                pos_weight = math.exp(-((rel_y - 0.10) ** 2) / 0.02)
                total_score = font_weight * 0.60 + pos_weight * 0.40
                title_candidates.append((b, total_score, rel_y))

        # Sort title candidates
        title_candidates.sort(key=lambda x: x[1], reverse=True)

        # Merge vertically adjacent title lines (e.g. 2-line video title)
        merged_title = ""
        top_candidates_text = []

        if title_candidates:
            best_b, best_score, best_y = title_candidates[0]
            merged_lines = [best_b]

            # Look for 2nd line of title right above or below
            for other_b, score, other_y in title_candidates[1:]:
                if other_b == author_block_ref:
                    continue
                # Ensure second line is not below the author
                if author_block_ref and other_y >= author_block_ref.rel_y:
                    continue
                # If font size is similar and y distance is small (adjacent lines)
                if abs(other_b.h - best_b.h) / max(1, best_b.h) < 0.35:
                    if 0 < abs(other_y - best_y) < (best_b.rel_h * 2.2):
                        merged_lines.append(other_b)
                        break

            # Sort merged lines by vertical position
            merged_lines.sort(key=lambda x: x.rel_y)
            merged_title = "".join([l.text for l in merged_lines])
            
            top_candidates_text = [c[0].text for c in title_candidates[:5]]

        return {
            "title": merged_title or (title_candidates[0][0].text if title_candidates else ""),
            "author": detected_author,
            "bvid": detected_bvid,
            "handle": detected_handle,
            "top_candidates": top_candidates_text,
            "is_vertical": is_vertical
        }


def extract_layout_clues(ocr: dict) -> dict:
    width, height = ocr.get("width") or 0, ocr.get("height") or 0
    if not width or not height:
        return {}
    blocks = []
    for entry in ocr.get("lines") or []:
        box, value = entry.get("box"), entry.get("text")
        if box and value:
            blocks.append(TextBlock(str(value), box, 0.8, width, height))
    return ReverseLayoutEngine().extract_layout_aware_entities(blocks, width, height)
