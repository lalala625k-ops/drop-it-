"""Ephemeral screenshot references; never write document contents to disk."""
import base64
import hashlib
import io
import ntpath
import os
import struct
import threading
import time
from PIL import Image


def fingerprint(image):
    image = image.convert('RGB')
    return hashlib.sha256(struct.pack('>II', *image.size) + image.tobytes()).hexdigest()


def local_file(path):
    if not isinstance(path, str) or len(path) > 32767 or '\0' in path:
        raise ValueError('文件路径无效')
    # Opening executables or URL shortcuts is not a document-link operation.
    if len(path) < 3 or not path[0].isascii() or not path[0].isalpha() or path[1] != ':' \
            or path[2] not in '\\/' or ':' in path[2:]:
        raise ValueError('请选择本机的完整文件路径')
    if ntpath.splitext(path)[1].lower() in {
        '.exe', '.com', '.bat', '.cmd', '.ps1', '.vbs', '.js', '.msi', '.scr', '.lnk', '.url', '.hta',
        '.py', '.pyw', '.jar', '.reg', '.wsf', '.wsh', '.vbe', '.jse', '.cpl', '.pif', '.msp', '.application'}:
        raise ValueError('此类型不能作为来源文档打开')
    if not os.path.isfile(path):
        raise ValueError('找不到原文件，请重新关联')
    return os.path.abspath(path)


def reference(path, linked_by='detected', app=None):
    path = local_file(path)
    return {'path': path, 'name': ntpath.basename(path), 'linkedBy': linked_by,
            **({'app': app} if app else {})}


class SourceStore:
    def __init__(self, clock=time.monotonic):
        self._clock, self._lock = clock, threading.Lock()
        self._entry = None

    def clear(self):
        with self._lock:
            self._entry = None

    def bind(self, image, source, sequence):
        with self._lock:
            self._entry = (fingerprint(image), dict(source), sequence, self._clock())

    def match(self, data_url, sequence):
        with self._lock:
            entry = self._entry
            if not entry or entry[2] != sequence or self._clock() - entry[3] > 300:
                return None
        if not isinstance(data_url, str) or len(data_url) > 32 * 1024 * 1024:
            return None
        try:
            header, data = data_url.split(',', 1)
            if header not in ('data:image/png;base64', 'data:image/jpeg;base64', 'data:image/webp;base64'):
                return None
            with Image.open(io.BytesIO(base64.b64decode(data, validate=True))) as image:
                if image.width * image.height > 20_000_000:
                    return None
                key = fingerprint(image)
        except Exception:
            return None
        with self._lock:
            entry = self._entry
            if entry and entry[0] == key and entry[2] == sequence and self._clock() - entry[3] <= 300:
                try:
                    return reference(entry[1]['path'], app=entry[1].get('app'))
                except ValueError:
                    pass
        return None


def verified_crop(screen, origin, selection, source_rect, obstructions, image):
    """Require an unchanged unannotated crop fully inside the source window."""
    x1, y1, x2, y2 = selection
    left, top, right, bottom = source_rect
    if x2 <= x1 or y2 <= y1 or not (left <= x1 < x2 < right and top <= y1 < y2 < bottom):
        return False
    if any(x1 < r and x2 >= l and y1 < b and y2 >= t for l, t, r, b in obstructions):
        return False
    ox, oy = origin
    # WeChat includes the last pixel; some versions return an exclusive end.
    for inclusive in (1, 0):
        box = (x1 - ox, y1 - oy, x2 - ox + inclusive, y2 - oy + inclusive)
        if box[0] < 0 or box[1] < 0 or box[2] > screen.width or box[3] > screen.height:
            continue
        if (box[2] - box[0], box[3] - box[1]) == image.size and fingerprint(screen.crop(box)) == fingerprint(image):
            return True
    return False
