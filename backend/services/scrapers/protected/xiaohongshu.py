"""P-008: Xiaohongshu note cover; locked by user approval on 2026-10-09."""
import hashlib
import io
import time
from urllib.parse import urljoin, urlparse

import requests
from PIL import Image

from backend.services.atomic_files import atomic_bytes
from backend.services.data_paths import get_assets_dir
from backend.services.scrapers.base import BaseScraper
from backend.services.scrapers.protected.xiaohongshu_page import content_image_url, note_id, parse_note_page

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Referer': 'https://www.xiaohongshu.com/',
}
SITE_HOSTS = {'xiaohongshu.com', 'www.xiaohongshu.com', 'xhslink.com', 'www.xhslink.com'}
MAX_IMAGE_BYTES = 12 * 1024 * 1024


def _site_url(url):
    parsed = urlparse(url)
    return (parsed.scheme in ('http', 'https') and parsed.hostname in SITE_HOSTS
            and not parsed.username and not parsed.password and parsed.port in (None, 80, 443))


def _page(session, url):
    for _ in range(6):
        response = session.get(url, headers=HEADERS, timeout=(3, 6), allow_redirects=False)
        if response.status_code in (301, 302, 303, 307, 308):
            url = urljoin(url, response.headers.get('Location', ''))
            if not _site_url(url):
                return None
            resolved = note_id(url)
            if resolved:
                url = urlparse(url)._replace(scheme='https', path='/discovery/item/' + resolved).geturl()
            continue
        if not response.ok or urlparse(url).path.startswith(('/login', '/404')):
            return None
        response.encoding = 'utf-8'
        return response
    return None


def _cache_image(session, url):
    try:
        with session.get(url, headers=HEADERS, timeout=(3, 6), stream=True) as response:
            if not response.ok or not content_image_url(response.url):
                return ''
            if int(response.headers.get('Content-Length') or 0) > MAX_IMAGE_BYTES:
                return ''
            content = bytearray()
            deadline = time.monotonic() + 6
            for chunk in response.iter_content(64 * 1024):
                content.extend(chunk)
                if len(content) > MAX_IMAGE_BYTES or time.monotonic() > deadline:
                    return ''
        with Image.open(io.BytesIO(content)) as image:
            extension = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp', 'GIF': 'gif'}.get(image.format)
            if not extension or min(image.size) < 100:
                return ''
            image.verify()
        filename = hashlib.sha256(content).hexdigest()[:16] + '.' + extension
        path = get_assets_dir() / filename
        if not path.is_file():
            atomic_bytes(path, bytes(content))
        return '/api/assets/' + filename
    except (requests.RequestException, OSError, ValueError, Image.DecompressionBombError):
        return ''


class XiaohongshuScraper(BaseScraper):
    name = 'xiaohongshu'
    status = 'PROTECTED'

    def can_handle(self, url):
        try:
            return _site_url(url) and (bool(note_id(url)) or (
                urlparse(url).hostname in ('xhslink.com', 'www.xhslink.com') and urlparse(url).path != '/'))
        except ValueError:
            return False

    def scrape(self, url):
        result = {'title': url, 'description': '', 'image': '',
                  'favicon': 'https://www.xiaohongshu.com/favicon.ico', 'url': url}
        with requests.Session() as session:
            # The domestic share page does not need the overseas-site proxy or
            # browser cookies. Retain the user's share parameters and note ID.
            session.trust_env = False
            target = urlparse(url)._replace(scheme='https')
            expected = note_id(url)
            if expected:
                target = target._replace(path='/discovery/item/' + expected)
            try:
                response = _page(session, target.geturl())
                if response is None:
                    return result
                resolved = note_id(response.url)
                if not resolved or (expected and expected != resolved):
                    return result
                parsed = parse_note_page(response.text, resolved)
                result.update(title=parsed['title'] or url, description=parsed['description'])
                # Use only the first note image, never a recommendation. Cache
                # verified bytes so the signed CDN URL cannot expire in a board.
                for image_url in parsed['images'][:2]:
                    result['image'] = _cache_image(session, image_url)
                    if result['image']:
                        break
            except (requests.RequestException, ValueError, TypeError, AttributeError):
                pass
        # Always return this site result: do not fall back to the login-page logo.
        return result
