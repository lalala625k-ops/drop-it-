# ==============================================================================
# 🔒 PROTECTED SCRAPERS REGISTRY (锁定区)
# Sites verified & approved OK by the user:
#   1. Bilibili (P-001)
#   2. Instagram (P-002)
#   3. YouTube (P-003)
#   4. Pinterest (P-004)
#   5. X / Twitter (P-005)
#   7. Shen's Blog (P-007)
#   8. Xiaohongshu (P-008)
# DO NOT MODIFY without explicit user instruction.
# ==============================================================================

from backend.services.scrapers.protected.bilibili import BilibiliScraper
from backend.services.scrapers.protected.instagram import InstagramScraper
from backend.services.scrapers.protected.youtube import YoutubeScraper
from backend.services.scrapers.protected.pinterest import PinterestScraper
from backend.services.scrapers.protected.x_twitter import XTwitterScraper
from backend.services.scrapers.protected.shens_blog import ShensBlogScraper
from backend.services.scrapers.protected.xiaohongshu import XiaohongshuScraper

PROTECTED_SCRAPERS = [
    BilibiliScraper(),
    InstagramScraper(),
    YoutubeScraper(),
    PinterestScraper(),
    XTwitterScraper(),
    ShensBlogScraper(),
    XiaohongshuScraper(),
]

__all__ = [
    "PROTECTED_SCRAPERS",
    "BilibiliScraper",
    "InstagramScraper",
    "YoutubeScraper",
    "PinterestScraper",
    "XTwitterScraper",
    "ShensBlogScraper",
    "XiaohongshuScraper",
]
