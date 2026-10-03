from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

@dataclass
class PlatformResult:
    platform: str
    platform_name: str
    title: str
    url: str
    author: Optional[str] = None
    cover_url: Optional[str] = None
    confidence: float = 0.8
    matched_method: str = "search"
    extra_urls: List[Dict[str, str]] = field(default_factory=list)
    raw_details: Dict[str, Any] = field(default_factory=dict)
    candidates: List[Dict[str, Any]] = field(default_factory=list)
    ocr_debug: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "platform": self.platform,
            "platform_name": self.platform_name,
            "title": self.title,
            "url": self.url,
            "author": self.author,
            "cover_url": self.cover_url,
            "confidence": round(self.confidence, 2),
            "matched_method": self.matched_method,
            "extra_urls": self.extra_urls,
            "raw_details": self.raw_details,
            "candidates": self.candidates,
            "ocr_debug": self.ocr_debug
        }
