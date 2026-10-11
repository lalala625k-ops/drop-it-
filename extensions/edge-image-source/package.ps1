param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$extensionRoot = $PSScriptRoot
if (-not $OutputPath) { $OutputPath = Join-Path (Split-Path $extensionRoot -Parent) 'edge-image-source-1.0.0.zip' }
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
# Explicit allowlist: never include personal files, browser profiles or dependencies.
$files = @(
  'manifest.json', 'background.js', 'source-reader.js', 'core.js', 'image-data.js',
  'clipboard.js', 'offscreen.html', 'offscreen.js', 'popup.html', 'popup.css', 'popup.js',
  'README.md', 'icons/16.png', 'icons/32.png', 'icons/48.png', 'icons/128.png', 'icons/icon.svg'
)
$stream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::Create)
try {
  $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($name in $files) {
      $source = Join-Path $extensionRoot $name
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive, $source, "edge-image-source/$name", [System.IO.Compression.CompressionLevel]::Optimal
      ) | Out-Null
    }
  } finally { $archive.Dispose() }
} finally { $stream.Dispose() }
Write-Output $OutputPath
