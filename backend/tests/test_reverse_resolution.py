import unittest
from unittest.mock import Mock, patch

from starlette.requests import Request

from backend.routes.parser import resolve_image
from backend.services.reverse_direct_service import recover_explicit_link
from backend.services.reverse_resolution_search import _candidate, search_platform
from backend.services.reverse_platforms.base import PlatformResult
from backend.services.reverse_vision_service import _parse_clues
from backend.services.reverse_xiaohongshu_search import search_public_page


URL = "https://www.bilibili.com/video/BV1xx411c7mD"
CLUES = {
    "platform": "bilibili", "site_domain": "bilibili.com",
    "title": "渴望让使人摆脱白昼中的奴隶身份，退回到统一的世界之夜中",
    "author": "Quaerite", "id": "", "search_query": "渴望 世界之夜 Quaerite",
}
OCR = {"success": True, "title": "", "text": "弹幕\nQuaerite", "count": 2}


def request():
    async def receive():
        return {"type": "http.request", "body": b"fake-image", "more_body": False}
    return Request({"type": "http", "method": "POST", "headers": []}, receive)


class ReverseResolutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_qr_and_visible_bvid_skip_model(self):
        with patch("backend.routes.parser.detect_qr_link", return_value=URL), patch(
                "backend.routes.parser.extract_text_from_image", side_effect=AssertionError("OCR called")):
            result = await resolve_image(request(), None)
            self.assertEqual(result["url"], URL)

        with patch("backend.routes.parser.detect_qr_link", return_value=None), patch(
                "backend.routes.parser.extract_text_from_image", return_value={**OCR, "text": "BV1xx411c7mD"}), patch(
                "backend.routes.parser.extract_visual_clues_with_status",
                side_effect=AssertionError("AI called")):
            result = await resolve_image(request(), None)
            self.assertEqual(result["url"], URL)
            self.assertEqual(result["vision_status"], "not_needed")

    async def test_ai_failure_does_not_search_with_ocr_title(self):
        with patch("backend.routes.parser.detect_qr_link", return_value=None), patch(
                "backend.routes.parser.extract_text_from_image", return_value=OCR), patch(
                "backend.routes.parser.extract_visual_clues_with_status", return_value=(None, "timeout")), patch(
                "backend.routes.parser.search_platform", side_effect=AssertionError("search called")):
            result = await resolve_image(request(), None)
            self.assertIsNone(result["url"])
            self.assertEqual(result["resolution"]["status"], "error")
            self.assertEqual(result["vision_status"], "timeout")

    async def test_candidates_are_reviewable_and_do_not_convert(self):
        candidate = {"url": URL, "title": CLUES["title"], "author": "Quaerite",
                     "source": "site", "score": 0.8, "auto_match": False}
        with patch("backend.routes.parser.detect_qr_link", return_value=None), patch(
                "backend.routes.parser.extract_text_from_image", return_value=OCR), patch(
                "backend.routes.parser.extract_visual_clues_with_status", return_value=(CLUES, "extracted")), patch(
                "backend.routes.parser.search_platform", return_value=([candidate], "completed")), patch(
                "backend.routes.parser.search_domain", return_value=([], "no_results")):
            result = await resolve_image(request(), None)
            self.assertIsNone(result["url"])
            self.assertEqual(result["resolution"]["status"], "candidates")
            self.assertEqual(result["resolution"]["candidates"][0]["url"], URL)

    async def test_site_match_skips_domain_fallback(self):
        candidate = {"url": URL, "title": CLUES["title"], "author": "Quaerite",
                     "source": "site", "score": 1.0, "auto_match": True}
        with patch("backend.routes.parser.detect_qr_link", return_value=None), patch(
                "backend.routes.parser.extract_text_from_image", return_value=OCR), patch(
                "backend.routes.parser.extract_visual_clues_with_status", return_value=(CLUES, "extracted")), patch(
                "backend.routes.parser.search_platform", return_value=([candidate], "completed")), patch(
                "backend.routes.parser.search_domain", side_effect=AssertionError("domain called")):
            result = await resolve_image(request(), None)
            self.assertEqual(result["url"], URL)
            self.assertEqual(result["resolution"]["status"], "matched")

    async def test_blocked_site_and_empty_domain_search_report_stages(self):
        with patch("backend.routes.parser.detect_qr_link", return_value=None), patch(
                "backend.routes.parser.extract_text_from_image", return_value=OCR), patch(
                "backend.routes.parser.extract_visual_clues_with_status", return_value=(CLUES, "extracted")), patch(
                "backend.routes.parser.search_platform", return_value=([], "blocked")), patch(
                "backend.routes.parser.search_domain", return_value=([], "no_results")):
            result = await resolve_image(request(), None)
            self.assertEqual(result["resolution"]["status"], "not_found")
            self.assertEqual(result["resolution"]["stages"][2],
                             {"name": "site_search", "status": "blocked"})

    def test_explicit_url_priority_and_reject_private_address(self):
        self.assertEqual(recover_explicit_link(f"https://example.com/post/123 BV1xx411c7mD"),
                         "https://example.com/post/123")
        self.assertIsNone(recover_explicit_link("http://127.0.0.1:8000/private"))

    def test_bilibili_search_retains_content_candidates_only(self):
        search_page = PlatformResult(platform="bilibili", platform_name="Bilibili",
                                     title="搜索", url="https://search.bilibili.com/all",
                                     matched_method="search_fallback", candidates=[])
        with patch("backend.services.reverse_resolution_search.BilibiliResolver") as resolver, patch(
                "backend.services.reverse_resolution_search._search_page", return_value=None):
            resolver.return_value.search_video.return_value = search_page
            results, status = search_platform({**CLUES, "search_query": ""}, OCR["text"])
            self.assertEqual(results, [])
            self.assertEqual(status, "no_results")

    def test_long_visible_title_prefix_and_author_can_auto_match(self):
        full_title = CLUES["title"] + "；沃尔夫拉姆·霍格雷贝：渴望与认识"
        match = _candidate(URL, full_title, "Quaerite", "site", CLUES["title"],
                           "Quaerite", "bilibili", "bilibili.com")
        self.assertTrue(match and match["auto_match"])
        wrong_author = _candidate(URL, full_title, "另一位作者", "site", CLUES["title"],
                                  "Quaerite", "bilibili", "bilibili.com")
        self.assertFalse(wrong_author and wrong_author["auto_match"])

    def test_model_fields_are_standardized(self):
        clues = _parse_clues('{"platform":"bilibili","site_domain":"bilibili.com",'
                             '"title":"示例标题","author":"Quaerite","id":"",'
                             '"distinctive_text":"特征句","search_query":"标题 Quaerite"}')
        self.assertEqual(clues["platform"], "bilibili")
        self.assertEqual(clues["author"], "Quaerite")
        self.assertEqual(clues["search_query"], "标题 Quaerite")

    def test_xiaohongshu_public_search_only_returns_content_links(self):
        html = '<a href="/search_result?keyword=test">search</a>' + ''.join(
            f'<a href="/explore/{number:024x}">笔记标题 {number}</a>'
            for number in range(1, 8))
        response = Mock(ok=True, status_code=200, text=html)
        with patch("backend.services.reverse_xiaohongshu_search.requests.get", return_value=response):
            items, status = search_public_page("笔记标题", None)
        self.assertEqual(status, "completed")
        self.assertEqual(len(items), 5)
        self.assertTrue(all("/explore/" in item["url"] for item in items))

    async def test_xiaohongshu_client_rendered_search_offers_manual_page(self):
        clues = {"platform": "xiaohongshu", "site_domain": "xiaohongshu.com",
                 "title": "一篇可搜索的笔记标题", "author": "作者"}
        with patch("backend.routes.parser.detect_qr_link", return_value=None), patch(
                "backend.routes.parser.extract_text_from_image", return_value=OCR), patch(
                "backend.routes.parser.extract_visual_clues_with_status", return_value=(clues, "extracted")), patch(
                "backend.routes.parser.search_platform", return_value=([], "unavailable")), patch(
                "backend.routes.parser.search_domain", side_effect=AssertionError("Bing called")):
            result = await resolve_image(request(), None)
        self.assertEqual(result["resolution"]["status"], "not_found")
        self.assertIn("xiaohongshu.com/search_result?keyword=", result["resolution"]["search_page"])

    def test_xiaohongshu_search_results_require_manual_choice(self):
        clues = {"platform": "xiaohongshu", "site_domain": "xiaohongshu.com",
                 "title": "一篇可搜索的笔记标题", "author": "作者"}
        note = {"url": "https://www.xiaohongshu.com/explore/000000000000000000000001",
                "title": clues["title"], "author": ""}
        with patch("backend.services.reverse_resolution_search.search_public_page",
                   return_value=([note], "completed")):
            items, status = search_platform(clues, "")
        self.assertEqual(status, "completed")
        self.assertEqual(len(items), 1)
        self.assertFalse(items[0]["auto_match"])


if __name__ == "__main__":
    unittest.main()
