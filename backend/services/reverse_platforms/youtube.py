import re
import json
import difflib
from typing import Optional, List, Dict, Any
from urllib.parse import quote
import requests
from .base import PlatformResult

def normalize_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r'[\s\W_]+', '', text, flags=re.UNICODE).lower()

class YouTubeResolver:
    def __init__(self, proxies: Optional[Dict[str, str]] = None):
        self.session = requests.Session()
        if proxies:
            self.session.proxies.update(proxies)
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7'
        })

    def extract_video_id(self, text: str) -> Optional[str]:
        # watch?v=XXXXXXXXXXX or youtu.be/XXXXXXXXXXX
        match = re.search(r'(?:v=|youtu\.be/)([0-9A-Za-z_-]{11})', text)
        if match:
            return match.group(1)
        return None

    def search_video(self, query: str, author_hint: Optional[str] = None) -> Optional[PlatformResult]:
        if not query or len(query.strip()) < 2:
            return None

        clean_query = query.strip()
        search_kw = clean_query
        search_url = f"https://www.youtube.com/results?search_query={quote(search_kw)}"

        try:
            resp = self.session.get('https://www.youtube.com/results', params={'search_query': search_kw}, timeout=8)
            m = re.search(r'var ytInitialData = ({.*?});</script>', resp.text)
            if not m:
                m = re.search(r'ytInitialData\s*=\s*({.+?});', resp.text)
            
            if m:
                data = json.loads(m.group(1))
                candidates = []

                def find_videos(d):
                    if isinstance(d, dict):
                        if 'videoRenderer' in d:
                            vr = d['videoRenderer']
                            vid = vr.get('videoId')
                            title_obj = vr.get('title', {})
                            title = title_obj.get('runs', [{}])[0].get('text', '') if 'runs' in title_obj else title_obj.get('simpleText', '')
                            owner_obj = vr.get('ownerText', {})
                            owner = owner_obj.get('runs', [{}])[0].get('text', '') if 'runs' in owner_obj else ''
                            owner_nav = vr.get('ownerText', {}).get('runs', [{}])[0].get('navigationEndpoint', {}).get('commandMetadata', {}).get('webCommandMetadata', {}).get('url', '')
                            
                            thumbs = vr.get('thumbnail', {}).get('thumbnails', [])
                            pic = thumbs[-1].get('url') if thumbs else ''
                            views = vr.get('viewCountText', {}).get('simpleText', '')
                            published = vr.get('publishedTimeText', {}).get('simpleText', '')

                            if vid and title:
                                candidates.append({
                                    'videoId': vid,
                                    'title': title,
                                    'author': owner,
                                    'channel_url': f'https://www.youtube.com{owner_nav}' if owner_nav else '',
                                    'pic': pic,
                                    'views': views,
                                    'published': published
                                })
                        for v in d.values():
                            yield from find_videos(v)
                    elif isinstance(d, list):
                        for item in d:
                            yield from find_videos(item)

                list(find_videos(data))

                if candidates:
                    q_norm = normalize_text(clean_query)
                    a_hint_norm = normalize_text(author_hint) if author_hint else ""

                    scored = []
                    for c in candidates:
                        c_title_norm = normalize_text(c['title'])
                        c_author_norm = normalize_text(c['author'])

                        # Title score
                        if q_norm == c_title_norm:
                            t_score = 3.0
                        elif q_norm in c_title_norm or c_title_norm in q_norm:
                            t_score = 2.0
                        else:
                            t_score = difflib.SequenceMatcher(None, q_norm, c_title_norm).ratio() * 1.5

                        # Author score
                        a_score = 0.0
                        if a_hint_norm:
                            if a_hint_norm == c_author_norm:
                                a_score = 1.5
                            elif a_hint_norm in c_author_norm or c_author_norm in a_hint_norm:
                                a_score = 1.0
                            else:
                                aratio = difflib.SequenceMatcher(None, a_hint_norm, c_author_norm).ratio()
                                if aratio > 0.6:
                                    a_score = aratio * 0.8

                        total = t_score + a_score
                        cand_item = {
                            "title": c['title'],
                            "author": c['author'],
                            "url": f"https://www.youtube.com/watch?v={c['videoId']}",
                            "pic": c['pic'],
                            "views": c['views'],
                            "published": c['published'],
                            "channel_url": c['channel_url'],
                            "score": round(total, 3)
                        }
                        scored.append((total, cand_item))

                    scored.sort(key=lambda x: x[0], reverse=True)
                    best_score, best_cand = scored[0]

                    confidence = 0.98 if best_score >= 2.0 else (0.88 if best_score >= 1.2 else 0.75)

                    extra_urls = []
                    if best_cand.get('channel_url'):
                        extra_urls.append({"name": f"频道主页 ({best_cand['author']})", "url": best_cand['channel_url']})
                    elif author_hint:
                        handle_tag = author_hint if author_hint.startswith('@') else f"@{author_hint}"
                        extra_urls.append({"name": f"直达 {handle_tag} 主页", "url": f"https://www.youtube.com/{handle_tag}"})
                    extra_urls.append({"name": "在 YouTube 搜索该视频", "url": search_url})
                    extra_urls.append({"name": "在 Google 搜索", "url": f"https://www.google.com/search?q=site:youtube.com+{quote(clean_query)}"})

                    top_candidates = [cand for _, cand in scored[:12]]

                    return PlatformResult(
                        platform="youtube",
                        platform_name="YouTube",
                        title=best_cand['title'],
                        url=best_cand['url'],
                        author=best_cand['author'] or author_hint,
                        cover_url=best_cand['pic'],
                        confidence=confidence,
                        matched_method="youtube_direct_scrape",
                        extra_urls=extra_urls,
                        raw_details={
                            "video_id": best_cand['url'].split("v=")[-1],
                            "views": best_cand.get('views', ''),
                            "published": best_cand.get('published', ''),
                            "search_query": search_kw
                        },
                        candidates=top_candidates
                    )

        except Exception as e:
            print(f"Error scraping YouTube search: {e}")

        # Fallback to search result URL
        handle_tag = author_hint if (author_hint and author_hint.startswith('@')) else (f"@{author_hint}" if author_hint else "")
        extra_urls = []
        if handle_tag:
            extra_urls.append({"name": f"直达 {handle_tag} 主页", "url": f"https://www.youtube.com/{handle_tag}"})
        extra_urls.append({"name": "在 YouTube 搜索该视频", "url": search_url})
        extra_urls.append({"name": "在 Google 搜索", "url": f"https://www.google.com/search?q=site:youtube.com+{quote(clean_query)}"})

        return PlatformResult(
            platform="youtube",
            platform_name="YouTube",
            title=clean_query,
            url=search_url,
            author=author_hint,
            confidence=0.80,
            matched_method="youtube_search_fallback",
            extra_urls=extra_urls,
            candidates=[]
        )

    def resolve(self, text: str, author: Optional[str] = None, title: Optional[str] = None) -> Optional[PlatformResult]:
        video_id = self.extract_video_id(text)
        if video_id:
            return PlatformResult(
                platform="youtube",
                platform_name="YouTube",
                title=f"YouTube 视频 ({video_id})",
                url=f"https://www.youtube.com/watch?v={video_id}",
                author=author,
                confidence=0.99,
                matched_method="youtube_id_direct",
                raw_details={"video_id": video_id}
            )

        query = title or ""
        if not query:
            lines = [l.strip() for l in text.split("\n") if len(l.strip()) > 3]
            filtered = [l for l in lines if not any(w in l for w in ["Subscribe", "YouTube", "Views", "views", "Subscribed", "Like", "Share", "Comments"])]
            query = filtered[0] if filtered else text[:40].strip()

        return self.search_video(query, author_hint=author)
