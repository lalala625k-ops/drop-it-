"""Windows sizing and Snap for the frameless WebView2 host."""
import ctypes
import logging
import os
from ctypes import wintypes


GWL_STYLE = -16
WS_CAPTION = 0x00C00000
WS_THICKFRAME = 0x00040000
WS_SYSMENU = 0x00080000
WS_MINIMIZEBOX = 0x00020000
WS_MAXIMIZEBOX = 0x00010000
WM_NCCALCSIZE = 0x0083
WM_NCHITTEST = 0x0084
WM_NCLBUTTONDOWN = 0x00A1
WM_GETMINMAXINFO = 0x0024
WM_NCDESTROY = 0x0082
HTCLIENT = 1
HTCAPTION = 2
RESIZE_HITS = {'w': 10, 'e': 11, 'n': 12, 'nw': 13, 'ne': 14,
               's': 15, 'sw': 16, 'se': 17}


class MonitorInfo(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('monitor', wintypes.RECT),
                ('work', wintypes.RECT), ('flags', wintypes.DWORD)]


class MinMaxInfo(ctypes.Structure):
    _fields_ = [(name, wintypes.POINT) for name in
                ('reserved', 'max_size', 'max_position', 'min_track', 'max_track')]


def edge_hit(x, y, width, height, border):
    """Physical pixels, with corners taking priority over individual edges."""
    horizontal = 'w' if x < border else 'e' if x >= width - border else ''
    vertical = 'n' if y < border else 's' if y >= height - border else ''
    return RESIZE_HITS.get(vertical + horizontal, HTCLIENT)


class WindowsWindowChrome:
    def __init__(self, window):
        self._window = window
        self._hwnd = None
        self._callback = None  # Keep the C callback alive for the HWND lifetime.
        self._user = ctypes.WinDLL('user32', use_last_error=True)
        self._comctl = ctypes.WinDLL('comctl32', use_last_error=True)
        pointer = ctypes.c_ssize_t
        self._callback_type = ctypes.WINFUNCTYPE(pointer, wintypes.HWND, wintypes.UINT,
                                                 ctypes.c_size_t, pointer,
                                                 ctypes.c_size_t, ctypes.c_size_t)
        self._user.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
        self._user.GetWindowLongW.restype = wintypes.LONG
        self._user.SetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.LONG]
        self._user.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int,
                                          ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
        self._user.SendMessageW.argtypes = [wintypes.HWND, wintypes.UINT, ctypes.c_size_t, pointer]
        self._user.SendMessageW.restype = pointer
        self._user.IsZoomed.argtypes = [wintypes.HWND]
        self._user.GetDpiForWindow.argtypes = [wintypes.HWND]
        self._user.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
        self._user.MonitorFromWindow.argtypes = [wintypes.HWND, wintypes.DWORD]
        self._user.MonitorFromWindow.restype = wintypes.HANDLE
        self._user.GetMonitorInfoW.argtypes = [wintypes.HANDLE, ctypes.POINTER(MonitorInfo)]
        self._user.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
        self._comctl.SetWindowSubclass.argtypes = [wintypes.HWND, self._callback_type,
                                                 ctypes.c_size_t, ctypes.c_size_t]
        self._comctl.RemoveWindowSubclass.argtypes = [wintypes.HWND, self._callback_type,
                                                    ctypes.c_size_t]
        self._comctl.DefSubclassProc.argtypes = [wintypes.HWND, wintypes.UINT,
                                               ctypes.c_size_t, pointer]
        self._comctl.DefSubclassProc.restype = pointer

    def install(self):
        # before_show is synchronous on the owning WinForms UI thread.
        self._hwnd = self._window.native.Handle.ToInt64()
        self._callback = self._callback_type(self._procedure)
        if not self._comctl.SetWindowSubclass(self._hwnd, self._callback, 1, 0):
            raise ctypes.WinError(ctypes.get_last_error())
        style = self._user.GetWindowLongW(self._hwnd, GWL_STYLE)
        style |= WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX
        self._user.SetWindowLongW(self._hwnd, GWL_STYLE, style)
        # Recalculate the client area; the subclass hides the system frame.
        self._user.SetWindowPos(self._hwnd, None, 0, 0, 0, 0, 0x0037)

    def _monitor(self, hwnd):
        info = MonitorInfo(size=ctypes.sizeof(MonitorInfo))
        monitor = self._user.MonitorFromWindow(hwnd, 2)
        if not self._user.GetMonitorInfoW(monitor, ctypes.byref(info)):
            raise ctypes.WinError(ctypes.get_last_error())
        return info

    def _procedure(self, hwnd, message, wparam, lparam, subclass_id, _data):
        try:
            if message == WM_NCCALCSIZE:
                if self._user.IsZoomed(hwnd):
                    rect = ctypes.cast(lparam, ctypes.POINTER(wintypes.RECT)).contents
                    work = self._monitor(hwnd).work
                    rect.left, rect.top, rect.right, rect.bottom = work.left, work.top, work.right, work.bottom
                return 0
            if message == WM_GETMINMAXINFO:
                result = self._comctl.DefSubclassProc(hwnd, message, wparam, lparam)
                info = self._monitor(hwnd)
                limits = ctypes.cast(lparam, ctypes.POINTER(MinMaxInfo)).contents
                limits.max_position.x = info.work.left - info.monitor.left
                limits.max_position.y = info.work.top - info.monitor.top
                limits.max_size.x = info.work.right - info.work.left
                limits.max_size.y = info.work.bottom - info.work.top
                return result
            if message == WM_NCHITTEST and not self.is_maximized():
                rect = wintypes.RECT()
                self._user.GetWindowRect(hwnd, ctypes.byref(rect))
                x = ctypes.c_short(lparam & 0xffff).value - rect.left
                y = ctypes.c_short((lparam >> 16) & 0xffff).value - rect.top
                border = round(6 * self._user.GetDpiForWindow(hwnd) / 96)
                hit = edge_hit(x, y, rect.right - rect.left, rect.bottom - rect.top, border)
                if hit != HTCLIENT:
                    return hit
            if message == WM_NCDESTROY:
                self._comctl.RemoveWindowSubclass(hwnd, self._callback, subclass_id)
                self._hwnd = None
        except Exception:
            logging.getLogger(__name__).exception('Native window chrome failed')
        return self._comctl.DefSubclassProc(hwnd, message, wparam, lparam)

    def is_maximized(self):
        return bool(self._hwnd and self._user.IsZoomed(self._hwnd))

    def begin_move(self):
        self._begin_native_loop(HTCAPTION)

    def begin_resize(self, edge):
        if edge in RESIZE_HITS and not self.is_maximized():
            self._begin_native_loop(RESIZE_HITS[edge])

    def _begin_native_loop(self, hit):
        from System import Action

        def begin():
            # A delayed JS bridge call must not start a drag after mouse-up.
            if not self._hwnd or not self._user.GetAsyncKeyState(1) & 0x8000:
                return
            cursor = wintypes.POINT()
            self._user.GetCursorPos(ctypes.byref(cursor))
            position = (cursor.x & 0xffff) | ((cursor.y & 0xffff) << 16)
            self._user.ReleaseCapture()
            # Windows owns the modal move/size loop, including Snap previews,
            # monitor/DPI changes and dragging a maximized window to restore.
            self._user.SendMessageW(self._hwnd, WM_NCLBUTTONDOWN, hit, position)

        if self._hwnd:
            self._window.native.Invoke(Action(begin))


def attach_window_chrome(window):
    if os.name != 'nt':
        return None
    chrome = WindowsWindowChrome(window)
    window.events.before_show += chrome.install
    return chrome
