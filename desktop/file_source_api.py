"""Document bridge calls exposed only through the desktop's pywebview API."""
import os
import time
from desktop.file_sources import local_file, reference


class FileSourceApi:
    def __init__(self):
        self._sources = None

    def match_screenshot_source(self, image):
        if not self._sources:
            return None
        # The clipboard listener can finish a little after the paste event.
        for _ in range(5):
            source = self._sources.match(image)
            if source:
                return source
            time.sleep(.06)
        return None

    def open_source_file(self, path):
        try:
            os.startfile(local_file(path))
            return {'success': True}
        except Exception as error:
            return {'success': False, 'error': str(error)}

    def select_source_file(self):
        if not self._window:
            return None
        import webview
        paths = self._window.create_file_dialog(webview.FileDialog.OPEN, allow_multiple=False)
        if not paths:
            return None
        try:
            return {'success': True, 'source': reference(paths[0], 'selected')}
        except ValueError as error:
            return {'success': False, 'error': str(error)}

    def get_source_capture_status(self):
        return self._sources.status() if self._sources else {'state': 'unavailable'}


def attach_file_sources(api, window):
    from desktop.screenshot_sources import ScreenshotSources
    api._sources = ScreenshotSources()
    api._sources.start()
    window.events.closed += lambda: api._sources.stop()
