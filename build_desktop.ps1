param(
    [switch]$SkipBackend,
    [switch]$SkipFrontend
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Write-Host "=== 随想便签 · 本地桌面安装包构建脚本 ===" -ForegroundColor Cyan
Write-Host "提示：图片与用户数据已与编译打包流程完全解耦（存储在 %LOCALAPPDATA%\InfiniteCanvasNote\data），大量图片不会影响编译速度。" -ForegroundColor Gray

if (-not $SkipFrontend) {
    Write-Host "`n[1/3] 正在构建前端生产包 (Vite)..." -ForegroundColor Yellow
    Push-Location (Join-Path $root 'frontend')
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }
    } finally { Pop-Location }
}

$backendExe = Join-Path $root 'backend\dist\pinboard-service.exe'
if ($SkipBackend -and (Test-Path $backendExe)) {
    Write-Host "`n[2/3] 跳过后端编译（已指定 -SkipBackend 且可执行文件已存在）..." -ForegroundColor Green
} else {
    Write-Host "`n[2/3] 正在使用 PyInstaller 编译本地后端独立服务..." -ForegroundColor Yellow
    Push-Location $root
    try {
        python -m PyInstaller --noconfirm --clean --onefile --name pinboard-service `
            --paths $root `
            --collect-all rapidocr_onnxruntime `
            --collect-all onnxruntime `
            --exclude-module torch `
            --exclude-module torchvision `
            --exclude-module torchaudio `
            --add-data "frontend/dist;web" `
            --distpath backend/dist `
            backend/desktop_server.py
        if ($LASTEXITCODE -ne 0) { throw '后端编译打包失败' }
    } finally { Pop-Location }
}

Write-Host "`n[3/3] 正在打包 Windows 离线安装程序 (NSIS Setup)..." -ForegroundColor Yellow
Push-Location (Join-Path $root 'desktop')
try {
    npm run dist
    if ($LASTEXITCODE -ne 0) { throw '安装程序打包失败' }
} finally { Pop-Location }

Write-Host "`n=== 构建完成！安装程序已生成于 dist-desktop/ 目录 ===" -ForegroundColor Green
