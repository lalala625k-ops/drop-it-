"""Read note-scoped Xiaohongshu data without executing page JavaScript."""
import json
import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup

NOTE_PATH = re.compile(r'^/(?:explore|discovery/item)/([0-9a-f]{24})/?$', re.I)


def note_id(url: str) -> str:
    match = NOTE_PATH.fullmatch(urlparse(url).path)
    return match[1].lower() if match else ''


def content_image_url(value) -> str:
    if not isinstance(value, str):
        return ''
    value = value.strip()
    if value.startswith('//'):
        value = 'https:' + value
    try:
        parsed = urlparse(value)
        host = (parsed.hostname or '').lower()
        valid = (parsed.scheme in ('https', 'http') and not parsed.username
                 and not parsed.password and parsed.port in (None, 80, 443))
    except ValueError:
        return ''
    if not valid or parsed.path in ('', '/'):
        return ''
    allowed = host == 'ci.xiaohongshu.com' or bool(re.fullmatch(
        r'sns-(?:webpic|img|na-i\d+)(?:-[a-z0-9]+)*\.xhscdn\.com', host))
    if not allowed or any(part in parsed.path.lower() for part in ('/avatar/', '/fe-platform/', '/logo')):
        return ''
    # Preserve CDN signatures and transforms. Removing them can break the image.
    return parsed._replace(scheme='https').geturl()


def _states(soup):
    for script in soup.find_all('script'):
        text = script.string or script.get_text()
        for match in re.finditer(r'(?:window\.)?__(?:INITIAL_STATE|SETUP_SERVER_STATE)__\s*=\s*', text):
            # JSON-like hydration data uses undefined. Leave quoted strings intact.
            payload = re.sub(r'"(?:\\.|[^"\\])*"|\bundefined\b',
                             lambda item: 'null' if item[0] == 'undefined' else item[0], text[match.end():])
            try:
                state, _ = json.JSONDecoder().raw_decode(payload)
                if isinstance(state, dict):
                    yield state
            except (ValueError, RecursionError):
                continue


def _notes(state, expected):
    def nested(*keys):
        value = state
        for key in keys:
            value = value.get(key) if isinstance(value, dict) else None
        return value

    details = nested('note', 'noteDetailMap')
    if isinstance(details, dict):
        entry = details.get(expected) or {}
        if isinstance(entry, dict):
            note = entry.get('note')
            if isinstance(note, dict) and str(note.get('noteId') or expected).lower() == expected:
                yield note
    for note in (
        nested('noteData', 'data', 'noteData'),
        nested('LAUNCHER_SSR_STORE_PAGE_DATA', 'noteData'),
    ):
        if isinstance(note, dict) and str(note.get('noteId', '')).lower() == expected:
            yield note


def _image_urls(image):
    if isinstance(image, str):
        return [image]
    if not isinstance(image, dict):
        return []
    entries = image.get('infoList') or []
    full_size = [entry.get('url') for entry in entries if isinstance(entry, dict)
                 and entry.get('imageScene') in ('H5_DTL', 'WB_DFT')]
    return full_size + [image.get(key) for key in ('urlDefault', 'url', 'urlPre')] + [
        entry.get('url') for entry in entries if isinstance(entry, dict)]


def parse_note_page(html: str, expected: str) -> dict:
    soup = BeautifulSoup(html, 'html.parser')
    result = {'title': '', 'description': '', 'images': []}
    for state in _states(soup):
        for note in _notes(state, expected):
            result['title'] = str(note.get('title') or result['title']).strip()
            result['description'] = str(note.get('desc') or result['description']).strip()
            images = note.get('imageList') or []
            video = note.get('video') or {}
            covers = ([images[0]] if isinstance(images, list) and images else []) + [note.get('cover')]
            if isinstance(video, dict):
                covers += [video.get('cover'), video.get('coverImage')]
            for cover in covers:
                for value in _image_urls(cover):
                    url = content_image_url(value)
                    if url and url not in result['images']:
                        result['images'].append(url)
    if result['images']:
        return result
    # Older pages can expose the note cover in metadata. Reject logos, avatars
    # and empty ci.xiaohongshu.com crop placeholders even when HTTP returns 200.
    def meta(name):
        tag = soup.find('meta', attrs={'property': name}) or soup.find('meta', attrs={'name': name})
        return str(tag.get('content') or '').strip() if tag else ''
    title = meta('og:title') or meta('twitter:title') or (soup.title.get_text(strip=True) if soup.title else '')
    if re.sub(r'[\s\-–—|]', '', title) in ('小红书', '小红书你的生活兴趣社区'):
        title = ''
    if any(word in title.lower() for word in ('登录', '页面不见了', 'access denied', 'sign in')):
        return result
    result['title'] = result['title'] or title
    result['description'] = result['description'] or meta('og:description') or meta('description')
    if title:
        for name in ('og:image', 'twitter:image'):
            url = content_image_url(meta(name))
            if url and url not in result['images']:
                result['images'].append(url)
    return result
