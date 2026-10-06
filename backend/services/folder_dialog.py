"""Native folder actions for the local desktop/web application."""
import ctypes
import os
from ctypes import wintypes
from pathlib import Path


def choose_folder(initial: Path) -> str | None:
    if os.name != "nt":
        raise OSError("当前系统不支持原生目录选择，请输入绝对路径")
    shell = ctypes.WinDLL("shell32", use_last_error=True)
    ole = ctypes.WinDLL("ole32", use_last_error=True)
    user = ctypes.WinDLL("user32", use_last_error=True)
    callback_type = ctypes.WINFUNCTYPE(ctypes.c_int, wintypes.HWND, ctypes.c_uint, wintypes.LPARAM, wintypes.LPARAM)
    initial_buffer = ctypes.create_unicode_buffer(str(initial))
    @callback_type
    def callback(hwnd, message, _param, _data):
        if message == 1:  # BFFM_INITIALIZED / BFFM_SETSELECTIONW
            user.SendMessageW(hwnd, 0x467, 1, ctypes.cast(initial_buffer, ctypes.c_void_p).value)
        return 0
    class BrowseInfo(ctypes.Structure):
        _fields_ = [("hwndOwner", wintypes.HWND), ("pidlRoot", ctypes.c_void_p),
                    ("pszDisplayName", wintypes.LPWSTR), ("lpszTitle", wintypes.LPCWSTR),
                    ("ulFlags", ctypes.c_uint), ("lpfn", callback_type),
                    ("lParam", wintypes.LPARAM), ("iImage", ctypes.c_int)]
    user.GetForegroundWindow.restype = wintypes.HWND
    user.SendMessageW.argtypes = [wintypes.HWND, ctypes.c_uint, wintypes.WPARAM, wintypes.LPARAM]
    shell.SHBrowseForFolderW.argtypes = [ctypes.POINTER(BrowseInfo)]
    shell.SHBrowseForFolderW.restype = ctypes.c_void_p
    shell.SHGetPathFromIDListW.argtypes = [ctypes.c_void_p, wintypes.LPWSTR]
    ole.CoTaskMemFree.argtypes = [ctypes.c_void_p]
    display = ctypes.create_unicode_buffer(32768)
    info = BrowseInfo(user.GetForegroundWindow(), None, display, "选择文件夹", 0x51, callback, 0, 0)
    initialized = ole.CoInitializeEx(None, 2)
    selected = None
    try:
        selected = shell.SHBrowseForFolderW(ctypes.byref(info))
        if not selected:
            return None
        result = ctypes.create_unicode_buffer(32768)
        if not shell.SHGetPathFromIDListW(selected, result):
            raise OSError("请选择本机文件夹")
        return str(Path(result.value).resolve())
    finally:
        if selected:
            ole.CoTaskMemFree(selected)
        if initialized >= 0:
            ole.CoUninitialize()


def open_folder(path: Path) -> None:
    if not path.is_dir():
        raise OSError("文件夹不存在")
    if os.name != "nt":
        raise OSError("当前系统不支持直接打开文件夹")
    os.startfile(str(path))
