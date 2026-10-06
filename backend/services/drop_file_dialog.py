"""Native Windows .drop file dialogs shared by the local website and desktop app."""

import ctypes
import os
from ctypes import wintypes
from pathlib import Path
from typing import Optional


def choose_drop_file(default_path: Path) -> Optional[Path]:
    if os.name != "nt":
        raise RuntimeError("当前系统尚不支持本地存为窗口")

    class OpenFileName(ctypes.Structure):
        _fields_ = [
            ("lStructSize", wintypes.DWORD),
            ("hwndOwner", wintypes.HWND),
            ("hInstance", wintypes.HINSTANCE),
            ("lpstrFilter", wintypes.LPCWSTR),
            ("lpstrCustomFilter", wintypes.LPWSTR),
            ("nMaxCustFilter", wintypes.DWORD),
            ("nFilterIndex", wintypes.DWORD),
            ("lpstrFile", wintypes.LPWSTR),
            ("nMaxFile", wintypes.DWORD),
            ("lpstrFileTitle", wintypes.LPWSTR),
            ("nMaxFileTitle", wintypes.DWORD),
            ("lpstrInitialDir", wintypes.LPCWSTR),
            ("lpstrTitle", wintypes.LPCWSTR),
            ("Flags", wintypes.DWORD),
            ("nFileOffset", wintypes.WORD),
            ("nFileExtension", wintypes.WORD),
            ("lpstrDefExt", wintypes.LPCWSTR),
            ("lCustData", wintypes.LPARAM),
            ("lpfnHook", ctypes.c_void_p),
            ("lpTemplateName", wintypes.LPCWSTR),
            ("pvReserved", ctypes.c_void_p),
            ("dwReserved", wintypes.DWORD),
            ("FlagsEx", wintypes.DWORD),
        ]

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.GetForegroundWindow.restype = wintypes.HWND
    dialog_api = ctypes.WinDLL("comdlg32", use_last_error=True)
    dialog_api.GetSaveFileNameW.argtypes = [ctypes.POINTER(OpenFileName)]
    dialog_api.GetSaveFileNameW.restype = wintypes.BOOL
    dialog_api.CommDlgExtendedError.restype = wintypes.DWORD

    path_buffer = ctypes.create_unicode_buffer(default_path.name, 32768)
    options = OpenFileName()
    options.lStructSize = ctypes.sizeof(OpenFileName)
    options.hwndOwner = user32.GetForegroundWindow()
    options.lpstrFilter = "DROP 工作区 (*.drop)\0*.drop\0\0"
    options.nFilterIndex = 1
    options.lpstrFile = ctypes.cast(path_buffer, wintypes.LPWSTR)
    options.nMaxFile = len(path_buffer)
    options.lpstrInitialDir = str(default_path.parent)
    options.lpstrTitle = "存为"
    options.lpstrDefExt = "drop"
    # Confirm overwrite, require an existing directory, preserve process cwd.
    options.Flags = 0x00000002 | 0x00000008 | 0x00000800 | 0x00080000
    if dialog_api.GetSaveFileNameW(ctypes.byref(options)):
        target = Path(path_buffer.value).resolve()
        if target.suffix.lower() != ".drop":
            raise ValueError("文件名请使用 .drop 扩展名")
        return target
    error = dialog_api.CommDlgExtendedError()
    if error:
        raise RuntimeError(f"无法打开存为窗口（错误码 {error}）")
    return None


def choose_existing_drop_file(default_path: Path) -> Optional[Path]:
    """Open a native picker for an existing .drop workspace file."""
    if os.name != "nt":
        raise RuntimeError("当前系统尚不支持本地打开窗口")

    class OpenFileName(ctypes.Structure):
        _fields_ = [
            ("lStructSize", wintypes.DWORD),
            ("hwndOwner", wintypes.HWND),
            ("hInstance", wintypes.HINSTANCE),
            ("lpstrFilter", wintypes.LPCWSTR),
            ("lpstrCustomFilter", wintypes.LPWSTR),
            ("nMaxCustFilter", wintypes.DWORD),
            ("nFilterIndex", wintypes.DWORD),
            ("lpstrFile", wintypes.LPWSTR),
            ("nMaxFile", wintypes.DWORD),
            ("lpstrFileTitle", wintypes.LPWSTR),
            ("nMaxFileTitle", wintypes.DWORD),
            ("lpstrInitialDir", wintypes.LPCWSTR),
            ("lpstrTitle", wintypes.LPCWSTR),
            ("Flags", wintypes.DWORD),
            ("nFileOffset", wintypes.WORD),
            ("nFileExtension", wintypes.WORD),
            ("lpstrDefExt", wintypes.LPCWSTR),
            ("lCustData", wintypes.LPARAM),
            ("lpfnHook", ctypes.c_void_p),
            ("lpTemplateName", wintypes.LPCWSTR),
            ("pvReserved", ctypes.c_void_p),
            ("dwReserved", wintypes.DWORD),
            ("FlagsEx", wintypes.DWORD),
        ]

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.GetForegroundWindow.restype = wintypes.HWND
    dialog_api = ctypes.WinDLL("comdlg32", use_last_error=True)
    dialog_api.GetOpenFileNameW.argtypes = [ctypes.POINTER(OpenFileName)]
    dialog_api.GetOpenFileNameW.restype = wintypes.BOOL
    dialog_api.CommDlgExtendedError.restype = wintypes.DWORD

    path_buffer = ctypes.create_unicode_buffer(default_path.name, 32768)
    options = OpenFileName()
    options.lStructSize = ctypes.sizeof(OpenFileName)
    options.hwndOwner = user32.GetForegroundWindow()
    options.lpstrFilter = "DROP 工作区 (*.drop)\0*.drop\0\0"
    options.nFilterIndex = 1
    options.lpstrFile = ctypes.cast(path_buffer, wintypes.LPWSTR)
    options.nMaxFile = len(path_buffer)
    options.lpstrInitialDir = str(default_path.parent)
    options.lpstrTitle = "打开"
    options.lpstrDefExt = "drop"
    # Existing file and directory only; preserve process cwd.
    options.Flags = 0x00001000 | 0x00000800 | 0x00080000
    if dialog_api.GetOpenFileNameW(ctypes.byref(options)):
        target = Path(path_buffer.value).resolve()
        if target.suffix.lower() != ".drop":
            raise ValueError("请选择 .drop 工作区文件")
        return target
    error = dialog_api.CommDlgExtendedError()
    if error:
        raise RuntimeError(f"无法打开文件窗口（错误码 {error}）")
    return None
