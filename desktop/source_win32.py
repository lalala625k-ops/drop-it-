"""Pointer-safe Windows primitives for the passive screenshot observer."""
import ctypes as c
import io
import struct
from ctypes import wintypes as w
from PIL import Image

RESULT = c.c_ssize_t
PROC = c.WINFUNCTYPE(RESULT, w.HWND, w.UINT, w.WPARAM, w.LPARAM)
HOOK = c.WINFUNCTYPE(RESULT, c.c_int, w.WPARAM, w.LPARAM)
ENUM = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)


class WindowClass(c.Structure):
    _fields_ = [('style', w.UINT), ('proc', PROC), ('cls_extra', c.c_int), ('wnd_extra', c.c_int),
               ('instance', w.HINSTANCE), ('icon', w.HICON), ('cursor', w.HANDLE), ('brush', w.HBRUSH),
               ('menu', w.LPCWSTR), ('name', w.LPCWSTR)]


class Key(c.Structure):
    _fields_ = [('code', w.DWORD), ('scan', w.DWORD), ('flags', w.DWORD), ('time', w.DWORD), ('extra', c.c_size_t)]


class Mouse(c.Structure):
    _fields_ = [('point', w.POINT), ('data', w.DWORD), ('flags', w.DWORD), ('time', w.DWORD), ('extra', c.c_size_t)]


class Windows:
    def __init__(self):
        self.u, self.k = c.WinDLL('user32', use_last_error=True), c.WinDLL('kernel32', use_last_error=True)
        declarations = [
            ('GetForegroundWindow', [], w.HWND), ('GetClipboardSequenceNumber', [], w.DWORD),
            ('GetWindowTextW', [w.HWND, w.LPWSTR, c.c_int], c.c_int),
            ('GetClassNameW', [w.HWND, w.LPWSTR, c.c_int], c.c_int),
            ('GetWindowThreadProcessId', [w.HWND, c.POINTER(w.DWORD)], w.DWORD),
            ('GetWindowRect', [w.HWND, c.POINTER(w.RECT)], w.BOOL), ('IsWindowVisible', [w.HWND], w.BOOL),
            ('SetWindowsHookExW', [c.c_int, HOOK, w.HINSTANCE, w.DWORD], w.HANDLE),
            ('CallNextHookEx', [w.HANDLE, c.c_int, w.WPARAM, w.LPARAM], RESULT),
            ('UnhookWindowsHookEx', [w.HANDLE], w.BOOL),
            ('DefWindowProcW', [w.HWND, w.UINT, w.WPARAM, w.LPARAM], RESULT),
            ('RegisterClassW', [c.POINTER(WindowClass)], w.WORD),
            ('CreateWindowExW', [w.DWORD, w.LPCWSTR, w.LPCWSTR, w.DWORD, c.c_int, c.c_int, c.c_int, c.c_int,
                                  w.HWND, w.HMENU, w.HINSTANCE, c.c_void_p], w.HWND),
            ('AddClipboardFormatListener', [w.HWND], w.BOOL),
            ('RemoveClipboardFormatListener', [w.HWND], w.BOOL), ('DestroyWindow', [w.HWND], w.BOOL),
            ('SetTimer', [w.HWND, c.c_size_t, w.UINT, c.c_void_p], c.c_size_t),
            ('GetMessageW', [c.POINTER(w.MSG), w.HWND, w.UINT, w.UINT], w.BOOL),
            ('OpenClipboard', [w.HWND], w.BOOL), ('CloseClipboard', [], w.BOOL),
            ('GetClipboardData', [w.UINT], w.HANDLE), ('IsClipboardFormatAvailable', [w.UINT], w.BOOL),
        ]
        for name, args, result in declarations:
            fn = getattr(self.u, name); fn.argtypes = args; fn.restype = result
        for name, args, result in [
            ('GetModuleHandleW', [w.LPCWSTR], w.HINSTANCE),
            ('GlobalSize', [w.HGLOBAL], c.c_size_t), ('GlobalLock', [w.HGLOBAL], c.c_void_p),
            ('GlobalUnlock', [w.HGLOBAL], w.BOOL),
            ('OpenProcess', [w.DWORD, w.BOOL, w.DWORD], w.HANDLE),
            ('QueryFullProcessImageNameW', [w.HANDLE, w.DWORD, w.LPWSTR, c.POINTER(w.DWORD)], w.BOOL),
            ('CloseHandle', [w.HANDLE], w.BOOL),
        ]:
            fn = getattr(self.k, name); fn.argtypes = args; fn.restype = result

    def text(self, hwnd, class_name=False):
        value = c.create_unicode_buffer(512)
        (self.u.GetClassNameW if class_name else self.u.GetWindowTextW)(hwnd, value, 512)
        return value.value

    def process(self, hwnd):
        pid = w.DWORD(); self.u.GetWindowThreadProcessId(hwnd, c.byref(pid))
        handle = self.k.OpenProcess(0x1000, False, pid.value)
        if not handle:
            return pid.value, ''
        try:
            value, size = c.create_unicode_buffer(32768), w.DWORD(32768)
            self.k.QueryFullProcessImageNameW(handle, 0, value, c.byref(size))
            return pid.value, value.value
        finally:
            self.k.CloseHandle(handle)

    def rect(self, hwnd):
        value = w.RECT()
        if not self.u.GetWindowRect(hwnd, c.byref(value)):
            return None
        return value.left, value.top, value.right, value.bottom

    def obstructions(self, source):
        result = []
        @ENUM
        def collect(hwnd, _):
            if hwnd == source:
                return False
            if self.u.IsWindowVisible(hwnd):
                rect = self.rect(hwnd)
                if rect:
                    result.append(rect)
            return True
        self.u.EnumWindows(collect, 0)
        return result

    def dib_image(self):
        # Read DIB bytes without touching CF_BITMAP or writing the clipboard.
        if not self.u.IsClipboardFormatAvailable(8) or not self.u.OpenClipboard(None):
            return None
        try:
            handle = self.u.GetClipboardData(8)
            size = self.k.GlobalSize(handle) if handle else 0
            if not 40 <= size <= 80 * 1024 * 1024:
                return None
            pointer = self.k.GlobalLock(handle)
            if not pointer:
                return None
            try:
                data = c.string_at(pointer, size)
            finally:
                self.k.GlobalUnlock(handle)
        finally:
            self.u.CloseClipboard()
        header, bits, compression, colors = struct.unpack_from('<I', data)[0], struct.unpack_from('<H', data, 14)[0], struct.unpack_from('<I', data, 16)[0], struct.unpack_from('<I', data, 32)[0]
        offset = header + (12 if header == 40 and compression == 3 else 0) + (colors or (1 << bits if bits <= 8 else 0)) * 4
        bmp = struct.pack('<2sIHHI', b'BM', len(data) + 14, 0, 0, offset + 14) + data
        with Image.open(io.BytesIO(bmp)) as image:
            if image.width * image.height > 20_000_000:
                return None
            return image.convert('RGB')
