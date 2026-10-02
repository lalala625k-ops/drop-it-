$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Push-Location (Join-Path $root 'frontend')
try { npm run build; if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' } }
finally { Pop-Location }
Push-Location $root
try {
    python -m PyInstaller --noconfirm --clean --onefile --name pinboard-service --paths $root --collect-all rapidocr_onnxruntime --collect-all onnxruntime --exclude-module torch --exclude-module torchvision --exclude-module torchaudio --add-data "frontend/dist;web" --distpath backend/dist backend/desktop_server.py
    if ($LASTEXITCODE -ne 0) { throw 'Backend packaging failed' }
} finally { Pop-Location }
Push-Location (Join-Path $root 'desktop')
try { npm run dist; if ($LASTEXITCODE -ne 0) { throw 'Installer packaging failed' } }
finally { Pop-Location }
