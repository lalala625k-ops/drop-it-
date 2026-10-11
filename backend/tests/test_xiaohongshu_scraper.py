import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import Mock, patch

from PIL import Image
from backend.services.scrapers.protected.xiaohongshu import XiaohongshuScraper
from backend.services.scrapers.protected.xiaohongshu_page import content_image_url, parse_note_page
from backend.services.scrapers.registry import scraper_registry

NOTE = '683a642e000000002202a108'
LINK = f'https://www.xiaohongshu.com/explore/{NOTE}?xsec_token=test-share&xsec_source=pc_share'
COVER = 'http://sns-webpic-qc.xhscdn.com/expiry/signature/notes_pre_post/first!h5_1080jpg'
SECOND = 'https://sns-webpic-qc.xhscdn.com/expiry/signature/notes_pre_post/second!h5_1080jpg'
LOGO = 'https://picasso-static.xiaohongshu.com/fe-platform/logo.png'


def page(note, wrapper='mobile'):
    if wrapper == 'desktop':
        state = {'note': {'noteDetailMap': {NOTE: {'note': note}, 'another': {
            'note': {'noteId': 'f' * 24, 'imageList': [{'url': SECOND}]}}}}}
        variable = '__INITIAL_STATE__'
    else:
        state = {'LAUNCHER_SSR_STORE_PAGE_DATA': {'noteData': note}}
        variable = '__SETUP_SERVER_STATE__'
    return f'<meta property="og:image" content="{LOGO}"><script>window.{variable}={json.dumps(state, ensure_ascii=False)}</script>'


def note():
    return {'noteId': NOTE, 'title': '真实笔记标题', 'desc': 'Description containing undefined.',
            'imageList': [{'infoList': [{'imageScene': 'H5_PRV', 'url': SECOND},
                                       {'imageScene': 'H5_DTL', 'url': COVER}]}, {'url': SECOND}],
            'user': {'avatar': 'https://sns-avatar-qc.xhscdn.com/avatar/person'}}


def response(url, text='', status=200, content=b''):
    value = Mock(url=url, text=text, status_code=status, ok=status < 400, headers={})
    value.__enter__ = Mock(return_value=value)
    value.__exit__ = Mock(return_value=False)
    value.iter_content.return_value = [content]
    return value


class XiaohongshuTests(unittest.TestCase):
    def setUp(self):
        self.scraper = XiaohongshuScraper()

    def test_only_note_and_official_short_links_match(self):
        for url in (LINK, LINK.replace('/explore/', '/discovery/item/'), 'http://xhslink.com/o/example'):
            self.assertTrue(self.scraper.can_handle(url))
        for url in ('https://xiaohongshu.com/', 'https://xiaohongshu.com/search_result',
                    'https://xiaohongshu.com.evil.test/explore/' + NOTE,
                    'https://example.com/?url=xiaohongshu.com',
                    'https://' + f'user:pass@xiaohongshu.com/explore/{NOTE}',
                    f'https://xiaohongshu.com:invalid/explore/{NOTE}'):
            self.assertFalse(self.scraper.can_handle(url))

    def test_mobile_and_desktop_select_first_target_note_image(self):
        for wrapper in ('mobile', 'desktop'):
            parsed = parse_note_page(page(note(), wrapper), NOTE)
            self.assertEqual(parsed['title'], '真实笔记标题')
            self.assertEqual(parsed['description'], 'Description containing undefined.')
            self.assertEqual(parsed['images'][0], COVER.replace('http:', 'https:'))
            self.assertNotIn(LOGO, parsed['images'])

    def test_initial_mobile_state_preserves_quoted_undefined(self):
        state = {'noteData': {'data': {'noteData': note()}}, 'missing': None}
        html = '<script>window.__INITIAL_STATE__=' + json.dumps(state).replace('"missing": null', '"missing": undefined') + '</script>'
        parsed = parse_note_page(html, NOTE)
        self.assertEqual(parsed['description'], note()['desc'])
        self.assertTrue(parsed['images'])

    def test_null_state_fields_and_malformed_image_urls_do_not_hide_valid_note(self):
        item = note()
        item['imageList'][0]['infoList'].insert(0, {'imageScene': 'H5_DTL',
            'url': 'https://sns-webpic-qc.xhscdn.com:invalid/image.jpg'})
        state = {'note': None, 'noteData': None, 'LAUNCHER_SSR_STORE_PAGE_DATA': {'noteData': item}}
        html = '<script>window.__INITIAL_STATE__=' + json.dumps(state) + '</script>'
        parsed = parse_note_page(html, NOTE)
        self.assertEqual(parsed['title'], item['title'])
        self.assertEqual(parsed['images'][0], COVER.replace('http:', 'https:'))

    def test_logo_avatar_empty_placeholder_and_foreign_host_are_rejected(self):
        for url in (LOGO, 'https://sns-avatar-qc.xhscdn.com/avatar/person.png',
                    'https://ci.xiaohongshu.com/?imageMogr2/crop/450x300',
                    'https://sns-webpic-qc.xhscdn.com.evil.test/image.jpg', 'data:image/png;base64,invalid'):
            self.assertEqual(content_image_url(url), '')
        html = f'<title>小红书 - 你的生活兴趣社区</title><meta property="og:image" content="{LOGO}">'
        self.assertEqual(parse_note_page(html, NOTE)['images'], [])

    def test_mismatched_state_cannot_supply_another_notes_cover(self):
        item = note(); item['noteId'] = 'f' * 24
        self.assertEqual(parse_note_page(page(item), NOTE)['images'], [])

    def test_video_cover_and_legacy_metadata_are_supported(self):
        item = note(); item['imageList'] = []; item['video'] = {'cover': {'url': COVER}}
        self.assertEqual(parse_note_page(page(item), NOTE)['images'][0], COVER.replace('http:', 'https:'))
        html = f'<meta property="og:title" content="Note title"><meta property="og:image" content="{COVER}">'
        self.assertEqual(parse_note_page(html, NOTE)['images'][0], COVER.replace('http:', 'https:'))

    def test_public_mobile_fetch_retains_share_parameters_and_caches_verified_cover(self):
        buffer = io.BytesIO(); Image.new('RGB', (1080, 1440), 'white').save(buffer, 'JPEG')
        media = buffer.getvalue()
        canonical = LINK.replace('/explore/', '/discovery/item/')
        session = Mock()
        session.__enter__ = Mock(return_value=session); session.__exit__ = Mock(return_value=False)
        session.get.side_effect = [response(canonical, page(note())), response(COVER.replace('http:', 'https:'), content=media)]
        with tempfile.TemporaryDirectory() as folder, patch(
                'backend.services.scrapers.protected.xiaohongshu.requests.Session', return_value=session), patch(
                'backend.services.scrapers.protected.xiaohongshu.get_assets_dir', return_value=Path(folder)):
            result = self.scraper.scrape(LINK)
            self.assertEqual(result['title'], '真实笔记标题')
            self.assertTrue(result['image'].startswith('/api/assets/'))
            self.assertEqual((Path(folder) / result['image'].split('/')[-1]).read_bytes(), media)
            self.assertEqual(result['url'], LINK)
            self.assertEqual(session.get.call_args_list[0].args[0], canonical)
            # Use the normal formal-save path: the cached cover must be embedded.
            from backend.routes.settings import ArchiveExportPayload, _build_drop_bytes
            with patch('backend.routes.settings.get_assets_dir', return_value=Path(folder)), patch(
                    'backend.routes.settings.get_screenshots_dir', return_value=Path(folder)/'absent'):
                archive = _build_drop_bytes(ArchiveExportPayload(cards=[{'image': result['image']}], groups=[]))
                with zipfile.ZipFile(io.BytesIO(archive)) as saved:
                    self.assertEqual(saved.read('assets/' + result['image'].split('/')[-1]), media)

    def test_login_failure_stays_in_site_rule_and_never_uses_generic_logo(self):
        session = Mock()
        session.__enter__ = Mock(return_value=session); session.__exit__ = Mock(return_value=False)
        login = response(LINK, status=302); login.headers = {'Location': 'https://www.xiaohongshu.com/login'}
        session.get.side_effect = [login, response('https://www.xiaohongshu.com/login', '<title>Login</title>')]
        with patch('backend.services.scrapers.protected.xiaohongshu.requests.Session', return_value=session), patch.object(
                scraper_registry.fallback_scraper, 'scrape', side_effect=AssertionError('Generic fallback called')):
            result = scraper_registry.scrape(LINK)
        self.assertEqual(result['image'], '')
        self.assertEqual(result['url'], LINK)

    def test_short_link_redirect_retains_share_query_and_rejects_foreign_redirect(self):
        canonical = LINK.replace('/explore/', '/discovery/item/')
        short = 'https://xhslink.com/o/example'
        redirected = response(short, status=302)
        redirected.headers = {'Location': LINK}
        session = Mock()
        session.__enter__ = Mock(return_value=session); session.__exit__ = Mock(return_value=False)
        session.get.side_effect = [redirected, response(canonical, page(note()))]
        with patch('backend.services.scrapers.protected.xiaohongshu.requests.Session', return_value=session), patch(
                'backend.services.scrapers.protected.xiaohongshu._cache_image', return_value='/api/assets/cover.jpg'):
            result = self.scraper.scrape(short)
        self.assertEqual(result['title'], note()['title'])
        self.assertEqual(result['url'], short)
        self.assertEqual(session.get.call_args_list[1].args[0], canonical)
        redirected.headers = {'Location': 'https://example.com/unrelated'}
        session.get.reset_mock(); session.get.side_effect = [redirected]
        with patch('backend.services.scrapers.protected.xiaohongshu.requests.Session', return_value=session):
            self.assertEqual(self.scraper.scrape(short)['image'], '')
        session.get.assert_called_once()

    def test_unverified_image_bytes_are_never_written(self):
        canonical = LINK.replace('/explore/', '/discovery/item/')
        session = Mock()
        session.__enter__ = Mock(return_value=session); session.__exit__ = Mock(return_value=False)
        session.get.side_effect = [response(canonical, page(note()))] + [response(
            COVER.replace('http:', 'https:'), content=b'<html>access denied</html>')] * 2
        with tempfile.TemporaryDirectory() as folder, patch(
                'backend.services.scrapers.protected.xiaohongshu.requests.Session', return_value=session), patch(
                'backend.services.scrapers.protected.xiaohongshu.get_assets_dir', return_value=Path(folder)):
            self.assertEqual(self.scraper.scrape(LINK)['image'], '')
            self.assertEqual(list(Path(folder).iterdir()), [])


if __name__ == '__main__':
    unittest.main()
