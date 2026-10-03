"""Per-request diagnostics. Never store headers, image bytes, or credentials."""

from contextvars import ContextVar
from urllib.parse import urlsplit

_events: ContextVar[list[dict] | None] = ContextVar("reverse_events", default=None)


def begin_trace():
    return _events.set([])


def end_trace(token):
    _events.reset(token)


def snapshot() -> list[dict]:
    return list(_events.get() or [])


def record(name: str, status: str, detail: str = "", url: str = "", http_status: int | None = None):
    events = _events.get()
    if events is None:
        return
    safe_url = ""
    if url:
        parts = urlsplit(url)
        # Query parameters can carry signatures, tokens, or user data.
        safe_url = f"{parts.scheme}://{parts.hostname or ''}{':' + str(parts.port) if parts.port else ''}{parts.path}"
    events.append({"name": name, "status": status, "detail": detail[:500],
                   "url": safe_url, "port": urlsplit(safe_url).port or
                   (443 if safe_url.startswith("https://") else 80 if safe_url else None),
                   "http_status": http_status})
