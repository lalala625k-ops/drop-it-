param(
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [string]$ReleaseDir
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Write-Host "=== Drop-it 0.1 · Windows 桌面版与免安装版构建 ===" -ForegroundColor Cyan
Write-Host "提示：图片与用户数据已与编译打包流程完全解耦（存储在 %LOCALAPPDATA%\InfiniteCanvasNote\data），大量图片不会影响编译速度。" -ForegroundColor Gray

if (-not $SkipFrontend) {
    Write-Host "`n[1/4] 正在构建前端生产包 (Vite)..." -ForegroundColor Yellow
    Push-Location (Join-Path $root 'frontend')
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }
    } finally { Pop-Location }
}

$backendExe = Join-Path $root 'backend\dist\pinboard-service.exe'
if ($SkipBackend -and (Test-Path $backendExe)) {
    Write-Host "`n[2/4] 跳过后端编译（已指定 -SkipBackend 且可执行文件已存在）..." -ForegroundColor Green
} else {
    Write-Host "`n[2/4] 正在使用 PyInstaller 编译本地后端独立服务..." -ForegroundColor Yellow
    Push-Location $root
    try {
        python -m PyInstaller --noconfirm --clean --onefile --name pinboard-service `
            --paths $root `
            --additional-hooks-dir scripts/pyinstaller_hooks `
            --collect-all rapidocr_onnxruntime `
            --collect-binaries onnxruntime `
            --collect-data onnxruntime `
            --exclude-module torch `
            --exclude-module torchvision `
            --exclude-module torchaudio `
            --exclude-module scipy `
            --exclude-module numba `
            --exclude-module llvmlite `
            --exclude-module PIL._avif `
            --exclude-module PIL.AvifImagePlugin `
            --add-data "frontend/dist;web" `
            --distpath backend/dist `
            backend/desktop_server.py
        if ($LASTEXITCODE -ne 0) { throw '后端编译打包失败' }
    } finally { Pop-Location }
}

Write-Host "`n[3/4] 正在编译轻量桌面启动程序 (Edge WebView2)..." -ForegroundColor Yellow
Push-Location $root
try {
    python -m PyInstaller --noconfirm --clean --onefile --name DropIt `
        --paths $root `
        --icon desktop/icons/icon.ico `
        --version-file desktop/windows_version.txt `
        --collect-all webview `
        --hidden-import webview.platforms.edgechromium `
        --exclude-module webview.platforms.cef `
        --exclude-module webview.platforms.gtk `
        --exclude-module webview.platforms.qt `
        --exclude-module webview.platforms.cocoa `
        --exclude-module webview.platforms.android `
        --distpath desktop/dist `
        --workpath build/launcher `
        desktop/app.py
    if ($LASTEXITCODE -ne 0) { throw '桌面启动程序编译失败' }
} finally { Pop-Location }

Write-Host "`n[4/4] 正在组装 Drop-it 0.1 免安装版与桌面安装程序..." -ForegroundColor Yellow
Push-Location $root
try {
    if ($ReleaseDir) {
        python scripts\build_dropit_installer.py --release-dir $ReleaseDir
    } else {
        python scripts\build_dropit_installer.py
    }
    if ($LASTEXITCODE -ne 0) { throw '安装程序打包失败' }
} finally { Pop-Location }

$outputDir = if ($ReleaseDir) { $ReleaseDir } else { Join-Path $root 'release' }
Write-Host "`n=== 构建完成！安装程序：$(Join-Path $outputDir 'Drop-it-Setup-0.1.exe') ===" -ForegroundColor Green
Write-Host "免安装目录：$(Join-Path $outputDir 'Drop-it 0.1')" -ForegroundColor Green
