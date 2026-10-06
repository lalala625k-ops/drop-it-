"""Lean OpenCV hook for OCR builds.

RapidOCR uses the cv2 extension for image transforms, but it never opens
video files.  The upstream hook bundles OpenCV's optional FFmpeg plugin,
which adds about 30 MB to the service for no runtime benefit here.
"""

import sys

from PyInstaller.utils.hooks import collect_data_files, collect_submodules


hiddenimports = ["numpy"] + collect_submodules(
    "cv2", filter=lambda name: name != "cv2.load_config_py2"
)
excludedimports = ["cv2.load_config_py2"]
datas = collect_data_files(
    "cv2",
    include_py_files=True,
    includes=[
        "config.py",
        f"config-{sys.version_info[0]}.{sys.version_info[1]}.py",
        "config-3.py",
        "load_config_py3.py",
    ],
)
module_collection_mode = "py"
