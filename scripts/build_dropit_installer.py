"""Assemble the lightweight DropIt Windows distribution.

The launcher uses the system Edge WebView2 engine, so the distribution only
contains the small native launcher and the frozen FastAPI service. This keeps
Chromium out of the installer while retaining a no-Python/no-Node install.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LABEL = "Drop-it 0.1"
PORTABLE_ROOT = ROOT / "release" / LABEL
INSTALLER_ROOT = ROOT / "release"
INSTALLER = INSTALLER_ROOT / "Drop-it-Setup-0.1.exe"
PORTABLE_ZIP = INSTALLER_ROOT / "Drop-it-0.1-Portable.zip"
TEMPLATE = ROOT / "desktop" / "Template" / "Template一.drop"
PAYLOAD = {"DropIt.exe", "pinboard-service.exe", "使用说明.txt", "Files/Template/Template一.drop"}


def require_file(path: Path, description: str) -> Path:
    if not path.is_file():
        raise FileNotFoundError(f"缺少{description}: {path}")
    return path


def validate_distribution(destination: Path) -> None:
    entries = list(destination.rglob("*"))
    if any(path.is_symlink() or path.is_junction() for path in entries):
        raise ValueError("发布目录不能包含符号链接或目录联接")
    files = {path.relative_to(destination).as_posix() for path in entries if path.is_file()}
    if files != PAYLOAD:
        raise ValueError("发布目录必须只包含程序、使用说明和指定 Template；不能打包用户数据")
    if (destination / "Files" / "Template" / "Template一.drop").read_bytes() != TEMPLATE.read_bytes():
        raise ValueError("发布示例与指定 Template 不一致")


def assemble_distribution(destination: Path, launcher: Path, service: Path, template: Path) -> None:
    destination = destination.resolve()
    if not destination.is_relative_to((ROOT / "release").resolve()) or destination == (ROOT / "release").resolve():
        raise ValueError("打包目标必须位于项目 release 目录内")
    if destination.exists():
        # Allow rebuilding a clean release, but protect saved boards and recovery.
        validate_distribution(destination)
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copy2(launcher, destination / "DropIt.exe")
    shutil.copy2(service, destination / "pinboard-service.exe")
    files_dir = destination / "Files"
    for name in ("Template", "Save", "Temporary"):
        (files_dir / name).mkdir(parents=True, exist_ok=True)
    template_dir = files_dir / "Template"
    # Copy only the designated example; never sweep up a user's other boards.
    shutil.copy2(template, template_dir / "Template一.drop")


def main(release_dir: Path = INSTALLER_ROOT, *, installer_only: bool = False) -> None:
    release_dir = release_dir.resolve()
    if not release_dir.is_relative_to((ROOT / "release").resolve()):
        raise ValueError("发布目录必须位于项目 release 目录内")
    portable_root = release_dir / LABEL
    portable_zip = release_dir / PORTABLE_ZIP.name
    installer = release_dir / INSTALLER.name
    launcher = require_file(ROOT / "desktop" / "dist" / "DropIt.exe", "桌面启动程序")
    service = require_file(ROOT / "backend" / "dist" / "pinboard-service.exe", "后端服务程序")
    template = require_file(TEMPLATE, "示例工作区 Template一.drop")

    seven_zip = Path(r"C:\Program Files\7-Zip\7z.exe")
    require_file(seven_zip, "7-Zip")
    compiler = os.environ.get("PINBOARD_MAKENSIS") or shutil.which("makensis")
    if not compiler:
        compiler = next((str(path) for path in (
            Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "NSIS" / "makensis.exe",
            Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "NSIS" / "makensis.exe",
        ) if path.is_file()), None)
    if not compiler:
        raise FileNotFoundError("请安装 NSIS，或设置 PINBOARD_MAKENSIS 为 makensis.exe 的完整路径")
    require_file(Path(compiler), "NSIS 编译器")
    if installer_only:
        validate_distribution(portable_root)
        build_installer(portable_root, installer, compiler)
        return
    assemble_distribution(portable_root, launcher, service, template)
    (portable_root / "使用说明.txt").write_text(
        f"{LABEL} 免安装版\n\n"
        "解压后双击 DropIt.exe 启动。请保持 pinboard-service.exe 与它在同一文件夹。\n"
        "Files/Template 内只有 Template一.drop，首次启动会直接显示这个示例画板。\n"
        "首次“打开”默认进入 Files/Template；首次保存和另存为默认进入 Files/Save。\n"
        "Files/Temporary 保存自动暂存和恢复记录。移动应用时请保留整个 Files 文件夹。\n"
        "数据库与运行时图片保存在当前 Windows 用户的 %LOCALAPPDATA%\\InfiniteCanvasNote。\n",
        encoding="utf-8",
    )

    release_dir.mkdir(parents=True, exist_ok=True)
    portable_zip.unlink(missing_ok=True)
    subprocess.run(
        [str(seven_zip), "a", "-tzip", "-mx=1", str(portable_zip), "."],
        cwd=portable_root,
        check=True,
    )
    validate_distribution(portable_root)
    build_installer(portable_root, installer, compiler)
    print(f"PORTABLE_DIR={portable_root}")
    print(f"PORTABLE_ZIP={portable_zip}")


def build_installer(portable_root: Path, installer: Path, compiler: str) -> None:
    # The ordinary 7z.sfx module only extracts files; it cannot create a Windows
    # installation or honor installer RunProgram directives. Use NSIS for the
    # per-user desktop edition and keep runtime boards out of its payload.
    quoted_uninstaller = r'$\"$INSTDIR\Uninstall.exe$\"'
    script = f'''Unicode true
Name "{LABEL}"
OutFile "{installer}"
InstallDir "$LOCALAPPDATA\\Drop-it"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!include "FileFunc.nsh"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\\DropIt.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
Section "Install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File "{portable_root}\\DropIt.exe"
  File "{portable_root}\\pinboard-service.exe"
  File "{portable_root}\\使用说明.txt"
  SetOutPath "$INSTDIR\\Files\\Template"
  File "{portable_root}\\Files\\Template\\Template一.drop"
  CreateDirectory "$INSTDIR\\Files\\Save"
  CreateDirectory "$INSTDIR\\Files\\Temporary"
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
  ${{GetParameters}} $0
  ${{GetOptions}} $0 "/NOSHORTCUTS" $1
  IfErrors 0 no_shortcuts
  CreateShortCut "$DESKTOP\\Drop-it.lnk" "$INSTDIR\\DropIt.exe"
  CreateShortCut "$SMPROGRAMS\\Drop-it.lnk" "$INSTDIR\\DropIt.exe"
no_shortcuts:
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Drop-it" "DisplayName" "{LABEL}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Drop-it" "DisplayVersion" "0.1"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Drop-it" "UninstallString" '{quoted_uninstaller}'
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  Delete "$INSTDIR\\DropIt.exe"
  Delete "$INSTDIR\\pinboard-service.exe"
  Delete "$INSTDIR\\使用说明.txt"
  Delete "$INSTDIR\\Uninstall.exe"
  Delete "$DESKTOP\\Drop-it.lnk"
  Delete "$SMPROGRAMS\\Drop-it.lnk"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Drop-it"
  RMDir "$INSTDIR"
SectionEnd
'''
    with tempfile.TemporaryDirectory(prefix="drop-it-installer-") as temporary:
        source = Path(temporary) / "drop-it.nsi"
        source.write_text(script, encoding="utf-8-sig")
        subprocess.run([compiler, "/V2", str(source)], check=True)
    print(f"INSTALLER={installer}")
    print(f"SIZE={installer.stat().st_size}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the DropIt desktop distribution")
    parser.add_argument("--release-dir", type=Path, default=INSTALLER_ROOT)
    parser.add_argument("--installer-only", action="store_true", help="Compile an installer from the verified existing portable directory")
    args = parser.parse_args()
    main(args.release_dir, installer_only=args.installer_only)
