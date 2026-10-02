# ==============================================================================
# SCRAPER REGISTRY & DISPATCHER
# Priority:
#   1. 🔒 PROTECTED_SCRAPERS (verified site exceptions)
#   2. ⏳ EXPERIMENTAL_SCRAPERS (site exceptions under development)
#   3. 🌐 GenericFallbackScraper (locked baseline for all other URLs)
# ==============================================================================

from typing import Dict, List, Optional
from backend.services.scrapers.base import BaseScraper, ScrapedMetadata
from backend.services.scrapers.protected import PROTECTED_SCRAPERS
from backend.services.scrapers.experimental import EXPERIMENTAL_SCRAPERS
from backend.services.scrapers.fallback import GenericFallbackScraper

class ScraperRegistry:
    def __init__(self):
        self.protected_scrapers: List[BaseScraper] = PROTECTED_SCRAPERS
        self.experimental_scrapers: List[BaseScraper] = EXPERIMENTAL_SCRAPERS
        self.fallback_scraper = GenericFallbackScraper()

    def scrape(self, url: str) -> Dict[str, str]:
        # Tier 1: 🔒 Protected Rules (Top Priority, User Approved OK)
        for scraper in self.protected_scrapers:
            if scraper.can_handle(url):
                try:
                    result = scraper.scrape(url)
                    if result:
                        return dict(result)
                except Exception as e:
                    print(f"[Registry] Error executing protected scraper '{scraper.name}': {e}")

        # Tier 2: ⏳ Experimental Rules (Under incubation)
        for scraper in self.experimental_scrapers:
            if scraper.can_handle(url):
                try:
                    result = scraper.scrape(url)
                    if result:
                        return dict(result)
                except Exception as e:
                    print(f"[Registry] Error executing experimental scraper '{scraper.name}': {e}")

        # Tier 3: 🌐 Generic OpenGraph & Screenshot Fallback
        res = self.fallback_scraper.scrape(url)
        return dict(res) if res else {
            "title": url,
            "description": "",
            "image": "",
            "favicon": "",
            "url": url,
        }

# Singleton registry instance
scraper_registry = ScraperRegistry()
