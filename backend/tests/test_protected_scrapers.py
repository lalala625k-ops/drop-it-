# ==============================================================================
# AUTOMATED REGRESSION TESTS FOR PROTECTED SCRAPERS (🔒 解析规则保护库测试锁)
# If any test fails, it indicates a forbidden modification or regression!
# ==============================================================================

import json
import unittest
from backend.services.scrapers.protected.bilibili import BilibiliScraper
from backend.services.scrapers.protected.instagram import InstagramScraper
from backend.services.scrapers.protected.youtube import YoutubeScraper
from backend.services.scrapers.protected.pinterest import PinterestScraper
from backend.services.scrapers.protected.x_twitter import XTwitterScraper
from backend.services.scrapers.protected.xiaohongshu import XiaohongshuScraper
from backend.services.scrapers.protected.xiaohongshu_page import parse_note_page
from backend.services.scrapers.experimental.feishu import FeishuScraper
from backend.services.scrapers.registry import scraper_registry

class TestProtectedScrapers(unittest.TestCase):
    def setUp(self):
        self.bilibili = BilibiliScraper()
        self.instagram = InstagramScraper()
        self.youtube = YoutubeScraper()
        self.pinterest = PinterestScraper()
        self.x_twitter = XTwitterScraper()
        self.xiaohongshu = XiaohongshuScraper()
        self.feishu = FeishuScraper()

    # --- P-001: Bilibili Tests ---
    def test_bilibili_lock_status(self):
        self.assertEqual(self.bilibili.status, "PROTECTED")
        self.assertEqual(self.bilibili.name, "bilibili")

    def test_bilibili_can_handle(self):
        self.assertTrue(self.bilibili.can_handle("https://www.bilibili.com/video/BV1xx411c7mD"))
        self.assertTrue(self.bilibili.can_handle("https://b23.tv/abcd123"))
        self.assertTrue(self.bilibili.can_handle("https://space.bilibili.com/123456"))
        self.assertFalse(self.bilibili.can_handle("https://www.zhihu.com/question/123456"))

    # --- P-002: Instagram Tests ---
    def test_instagram_lock_status(self):
        self.assertEqual(self.instagram.status, "PROTECTED")
        self.assertEqual(self.instagram.name, "instagram")

    def test_instagram_can_handle(self):
        self.assertTrue(self.instagram.can_handle("https://www.instagram.com/p/C_abc123/"))
        self.assertTrue(self.instagram.can_handle("https://instagr.am/reel/C_reel123/"))
        self.assertTrue(self.instagram.can_handle("https://www.instagram.com/natgeo/"))
        self.assertFalse(self.instagram.can_handle("https://www.bilibili.com"))

    # --- P-003: YouTube Tests ---
    def test_youtube_lock_status(self):
        self.assertEqual(self.youtube.status, "PROTECTED")
        self.assertEqual(self.youtube.name, "youtube")

    def test_youtube_can_handle(self):
        self.assertTrue(self.youtube.can_handle("https://www.youtube.com/watch?v=ZELPNFXJ4_o"))
        self.assertTrue(self.youtube.can_handle("https://youtu.be/ZELPNFXJ4_o"))
        self.assertTrue(self.youtube.can_handle("https://www.youtube.com/shorts/abcd1234efg"))
        self.assertFalse(self.youtube.can_handle("https://www.bilibili.com"))

    # --- P-004: Pinterest Tests ---
    def test_pinterest_lock_status(self):
        self.assertEqual(self.pinterest.status, "PROTECTED")
        self.assertEqual(self.pinterest.name, "pinterest")

    def test_pinterest_can_handle(self):
        self.assertTrue(self.pinterest.can_handle("https://www.pinterest.com/pin/1084804628993834507/"))
        self.assertTrue(self.pinterest.can_handle("https://de.pinterest.com/pin/294563631904240522/"))
        self.assertTrue(self.pinterest.can_handle("https://pin.it/abc1234"))
        self.assertFalse(self.pinterest.can_handle("https://www.youtube.com"))

    # --- E-001: Feishu Tests ---
    def test_feishu_experimental_status(self):
        self.assertEqual(self.feishu.status, "EXPERIMENTAL")
        self.assertEqual(self.feishu.name, "feishu")
        self.assertTrue(self.feishu.can_handle("https://my.feishu.cn/docx/IXpFdFUD2o6cQ5xxlcYc"))

    # --- P-005: X / Twitter Tests ---
    def test_x_twitter_lock_status(self):
        self.assertEqual(self.x_twitter.status, "PROTECTED")
        self.assertEqual(self.x_twitter.name, "x_twitter")

    def test_x_twitter_can_handle(self):
        self.assertTrue(self.x_twitter.can_handle("https://x.com/jack/status/20"))
        self.assertTrue(self.x_twitter.can_handle("https://twitter.com/elonmusk"))
        self.assertTrue(self.x_twitter.can_handle("https://mobile.twitter.com/i/web/status/123"))
        self.assertFalse(self.x_twitter.can_handle("https://www.youtube.com"))

    # --- P-008: Xiaohongshu Tests ---
    def test_xiaohongshu_lock_status(self):
        self.assertEqual(self.xiaohongshu.status, "PROTECTED")
        self.assertEqual(self.xiaohongshu.name, "xiaohongshu")
        self.assertNotIn("xiaohongshu", [s.name for s in scraper_registry.experimental_scrapers])

    def test_xiaohongshu_can_handle(self):
        note_id = "683a642e000000002202a108"
        self.assertTrue(self.xiaohongshu.can_handle(f"https://www.xiaohongshu.com/explore/{note_id}"))
        self.assertTrue(self.xiaohongshu.can_handle(f"https://www.xiaohongshu.com/discovery/item/{note_id}"))
        self.assertTrue(self.xiaohongshu.can_handle("https://xhslink.com/o/example"))
        self.assertFalse(self.xiaohongshu.can_handle("https://www.xiaohongshu.com/search_result"))
        self.assertFalse(self.xiaohongshu.can_handle(f"https://xiaohongshu.com.evil.test/explore/{note_id}"))

    def test_xiaohongshu_first_note_cover_gold(self):
        note_id = "683a642e000000002202a108"
        detail = "https://sns-webpic-qc.xhscdn.com/expiry/signature/notes_pre_post/first!h5_1080jpg"
        preview = "https://sns-webpic-qc.xhscdn.com/expiry/signature/notes_pre_post/first!h5_240jpg"
        state = {"LAUNCHER_SSR_STORE_PAGE_DATA": {"noteData": {
            "noteId": note_id, "title": "Note title", "desc": "Note description",
            "imageList": [{"infoList": [{"imageScene": "H5_PRV", "url": preview},
                                       {"imageScene": "H5_DTL", "url": detail}]},
                          {"url": "https://sns-webpic-qc.xhscdn.com/expiry/signature/notes_pre_post/second"}],
        }}}
        html = ('<meta property="og:image" content="https://picasso-static.xiaohongshu.com/fe-platform/logo.png">'
                '<script>window.__SETUP_SERVER_STATE__=' + json.dumps(state) + '</script>')
        self.assertEqual(parse_note_page(html, note_id), {
            "title": "Note title", "description": "Note description", "images": [detail, preview],
        })

    # --- Registry Dispatch & Priority Tests ---
    def test_registry_protected_list(self):
        names = [s.name for s in scraper_registry.protected_scrapers]
        self.assertEqual(names, ["bilibili", "instagram", "youtube", "pinterest", "x_twitter", "shens_blog", "xiaohongshu"])

if __name__ == "__main__":
    unittest.main()
