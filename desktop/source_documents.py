"""Read running applications only; this helper never creates COM instances."""
import ctypes as c
import json
import ntpath
import sys
import uuid
from ctypes import wintypes as w
from desktop.source_win32 import Windows, ENUM
from desktop.file_sources import reference


def read_document(hwnd):
    import clr  # pywebview's existing pythonnet dependency
    from System import IntPtr
    from System.Reflection import BindingFlags
    from System.Runtime.InteropServices import Marshal
    windows = Windows()
    prop = lambda obj, name: obj.GetType().InvokeMember(name, BindingFlags.GetProperty, None, obj, None)
    title, cls = windows.text(hwnd), windows.text(hwnd, True)
    children = []
    @ENUM
    def child(handle, _):
        if windows.u.IsWindowVisible(handle):
            children.append((handle, windows.text(handle, True)))
        return True
    windows.u.EnumChildWindows(hwnd, child, 0)
    if cls == 'Photoshop':
        # A global running object cannot prove identity with multiple processes.
        visible = set()
        @ENUM
        def count(handle, _):
            if windows.u.IsWindowVisible(handle) and windows.text(handle, True) == 'Photoshop':
                visible.add(handle)
            return True
        windows.u.EnumWindows(count, 0)
        if len(visible) != 1:
            return None
        app = Marshal.GetActiveObject('Photoshop.Application')
        path = str(prop(prop(app, 'ActiveDocument'), 'FullName'))
        name = 'Photoshop'
    elif '.pdf' in title.lower():
        # Do not treat every PDF reader as WPS, even if KPDF happens to run.
        exe = ntpath.basename(windows.process(hwnd)[1]).lower()
        if exe not in ('wps.exe', 'wpspdf.exe', 'kpdf.exe'):
            return None
        visible = set()
        @ENUM
        def count_pdf(handle, _):
            if windows.u.IsWindowVisible(handle) and '.pdf' in windows.text(handle).lower() \
                    and ntpath.basename(windows.process(handle)[1]).lower() in ('wps.exe', 'wpspdf.exe', 'kpdf.exe'):
                visible.add(handle)
            return True
        windows.u.EnumWindows(count_pdf, 0)
        if visible != {hwnd}:
            return None
        app = Marshal.GetActiveObject('KPDF.Application')
        path = str(prop(prop(app, 'ActiveDocument'), 'FullName'))
        name = 'WPS PDF'
    else:
        native = None
        for handle, child_cls in children:
            if child_cls not in ('mdiClass', 'paneClassDC'):
                continue
            guid = c.create_string_buffer(uuid.UUID('00020400-0000-0000-C000-000000000046').bytes_le)
            pointer = c.c_void_p()
            fn = c.WinDLL('oleacc').AccessibleObjectFromWindow
            fn.argtypes = [w.HWND, w.DWORD, c.c_void_p, c.POINTER(c.c_void_p)]; fn.restype = c.c_long
            if fn(handle, 4294967280, guid, c.byref(pointer)) == 0 and pointer.value:
                native = Marshal.GetObjectForIUnknown(IntPtr(pointer.value))
                Marshal.Release(IntPtr(pointer.value))
                break
        if native is None:
            return None
        path = str(prop(prop(native, 'Presentation'), 'FullName'))
        name = 'WPS 演示'
    if ntpath.basename(path).casefold() not in title.casefold():
        return None
    return reference(path, app=name)


def serve():
    # Initialize CLR once before reading requests, avoiding slow per-shot startup.
    import clr
    c.WinDLL('ole32').CoInitialize(None)
    print(json.dumps({'ready': True}), flush=True)
    for line in sys.stdin:
        try:
            request = json.loads(line)
            result = read_document(int(request['hwnd']))
        except Exception:
            result = None
        print(json.dumps({'source': result}, ensure_ascii=False), flush=True)
