# ==============================================================================
# ⏳ EXPERIMENTAL SCRAPERS REGISTRY
# New scrapers under development/testing belong here.
# Once tested and explicitly confirmed "OK" by user, move to protected/ package.
# ==============================================================================

from typing import List
from backend.services.scrapers.base import BaseScraper
from backend.services.scrapers.experimental.feishu import FeishuScraper
from backend.services.scrapers.experimental.medium import MediumScraper

EXPERIMENTAL_SCRAPERS: List[BaseScraper] = [FeishuScraper(), MediumScraper()]

__all__ = ["EXPERIMENTAL_SCRAPERS", "FeishuScraper", "MediumScraper"]
