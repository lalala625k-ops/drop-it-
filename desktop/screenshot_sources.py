"""Observe verified WeChat Alt+A crops without intercepting input or clipboard."""
import ctypes as c
import ntpath
import os
import queue
import threading
import time
from ctypes import wintypes as w
from PIL import ImageGrab
from desktop.file_sources import SourceStore, verified_crop
from desktop.source_probe_client import DocumentProbe


class ScreenshotSources:
    def __init__(self):
        self._store = SourceStore()
        self._stop = threading.Event()
        self._tasks = queue.Queue()
        self._probe = DocumentProbe()
        self._pending = None
        self._windows = None
        self._status = 'starting'
        self._probe_ready = False
        self._listener_ready = False

    def start(self):
        if os.name != 'nt':
            self._status = 'unavailable'
            return
        threading.Thread(target=self._work, daemon=True, name='ScreenshotDocumentSource').start()
        threading.Thread(target=self._listen, daemon=True, name='ScreenshotSourceEvents').start()

    def stop(self):
        self._stop.set()
        self._status = 'stopped'
        self._tasks.put(None)
        self._store.clear()
        self._probe.stop()

    def match(self, image):
        windows = self._windows
        if not windows:
            return None
        sequence = windows.u.GetClipboardSequenceNumber()
        source = self._store.match(image, sequence)
        return source if windows.u.GetClipboardSequenceNumber() == sequence else None

    def status(self):
        state = 'ready' if self._probe_ready and self._listener_ready and not self._stop.is_set() else self._status
        return {'state': state, 'capture': 'WeChat Alt+A'}

    def _work(self):
        try:
            self._probe.start()
            self._probe_ready = True
        except Exception:
            self._status = 'unavailable'
        while not self._stop.is_set():
            task = self._tasks.get()
            if task is None:
                break
            kind, pending, sequence = task
            if kind == 'source':
                source = self._probe.read(pending['hwnd'])
                if self._pending is pending and not pending.get('completed'):
                    pending['source'] = source
            elif kind == 'image':
                try:
                    time.sleep(.08)  # WeChat finishes publishing all DIB formats.
                    if not pending.get('source') or self._stop.is_set() or self._pending is not pending:
                        continue
                    windows = self._windows
                    if windows.u.GetClipboardSequenceNumber() != sequence:
                        continue
                    image = windows.dib_image()
                    if image and windows.u.GetClipboardSequenceNumber() == sequence and verified_crop(
                        pending['screen'], pending['origin'], pending['selection'], pending['rect'],
                        pending['obstructions'], image):
                        self._store.bind(image, pending['source'], sequence)
                    if self._pending is pending and pending.get('sequence') == sequence:
                        self._pending = None
                except Exception:
                    pass

    def _begin(self, hwnd):
        self._pending = None
        self._store.clear()
        windows = self._windows
        cls, title = windows.text(hwnd, True), windows.text(hwnd).lower()
        if cls != 'Photoshop' and not (cls.startswith('Qt') and title.endswith(' - wps office') and ('.pdf' in title or '.ppt' in title)):
            return
        # Screen pixels are kept only for this crop and released on completion.
        screen = ImageGrab.grab(all_screens=True)
        pending = {'hwnd': hwnd, 'screen': screen, 'rect': windows.rect(hwnd),
                   'origin': (windows.u.GetSystemMetrics(76), windows.u.GetSystemMetrics(77)),
                   'obstructions': windows.obstructions(hwnd), 'time': time.monotonic(), 'source': None}
        self._pending = pending
        self._tasks.put(('source', pending, None))

    def _overlay(self, hwnd):
        windows = self._windows
        if windows.text(hwnd, True) not in ('SnapshotWnd', 'CToolBarWnd'):
            return False
        return ntpath.basename(windows.process(hwnd)[1]).lower() in ('wechat.exe', 'weixin.exe')

    def _listen(self):
        from desktop.source_win32 import Windows, WindowClass, PROC, HOOK, Key, Mouse
        self._windows = windows = Windows(); u = windows.u
        u.SetThreadDpiAwarenessContext.argtypes = [c.c_void_p]
        u.SetThreadDpiAwarenessContext.restype = c.c_void_p
        u.SetThreadDpiAwarenessContext(c.c_void_p(-4))
        @PROC
        def procedure(hwnd, message, wp, lp):
            if message == 0x031D:
                self._store.clear()
                pending = self._pending
                if pending and pending.get('selection') and pending.get('overlay'):
                    pending['completed'] = True
                    pending['sequence'] = u.GetClipboardSequenceNumber()
                    self._tasks.put(('image', pending, u.GetClipboardSequenceNumber()))
                else:
                    self._pending = None
                return 0
            if message == 0x0113:
                pending = self._pending
                if self._stop.is_set(): u.PostQuitMessage(0)
                elif pending:
                    foreground = u.GetForegroundWindow()
                    if time.monotonic() - pending['time'] > 30:
                        self._pending = None
                    elif self._overlay(foreground): pending['overlay'] = True
                    elif pending.get('overlay') and foreground != pending['hwnd'] and not pending.get('completed'):
                        self._pending = None
                return 0
            return u.DefWindowProcW(hwnd, message, wp, lp)
        @HOOK
        def keyboard(code, wp, lp):
            if code >= 0 and wp in (0x100, 0x104):
                key = c.cast(lp, c.POINTER(Key)).contents
                if key.code == 0x1B: self._pending = None
                elif key.code == 0x41 and key.flags & 0x20 and not u.GetAsyncKeyState(0x11) & 0x8000:
                    try: self._begin(u.GetForegroundWindow())
                    except Exception: self._pending = None
            return u.CallNextHookEx(None, code, wp, lp)
        @HOOK
        def mouse(code, wp, lp):
            pending = self._pending
            if code >= 0 and pending and self._overlay(u.GetForegroundWindow()):
                point = c.cast(lp, c.POINTER(Mouse)).contents.point
                pending['overlay'] = True
                if wp == 0x201: pending['down'] = (point.x, point.y)
                elif wp == 0x202 and pending.get('down'):
                    x, y = pending.pop('down')
                    if abs(point.x - x) > 5 and abs(point.y - y) > 5:
                        pending['selection'] = (min(x, point.x), min(y, point.y), max(x, point.x), max(y, point.y))
            return u.CallNextHookEx(None, code, wp, lp)
        hooks, hwnd = [], None
        try:
            instance = windows.k.GetModuleHandleW(None)
            name = 'DropItScreenshotSource' + str(id(self))
            wc = WindowClass(proc=procedure, instance=instance, name=name)
            if not u.RegisterClassW(c.byref(wc)): raise c.WinError(c.get_last_error())
            hwnd = u.CreateWindowExW(0, name, '', 0, 0, 0, 0, 0, w.HWND(-3), None, instance, None)
            if not hwnd or not u.AddClipboardFormatListener(hwnd): raise c.WinError(c.get_last_error())
            for kind, callback in ((13, keyboard), (14, mouse)):
                handle = u.SetWindowsHookExW(kind, callback, instance, 0)
                if not handle: raise c.WinError(c.get_last_error())
                hooks.append(handle)
            u.SetTimer(hwnd, 1, 80, None)
            self._listener_ready = True
            msg = w.MSG()
            while u.GetMessageW(c.byref(msg), None, 0, 0) > 0:
                u.TranslateMessage(c.byref(msg)); u.DispatchMessageW(c.byref(msg))
        except Exception:
            self._status = 'unavailable'
        finally:
            self._listener_ready = False
            for handle in hooks: u.UnhookWindowsHookEx(handle)
            if hwnd: u.RemoveClipboardFormatListener(hwnd); u.DestroyWindow(hwnd)
            self._pending = None
