param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskSource = Join-Path $taskRoot 'backend/dist/pinboard-service.exe'
$taskTarget = Join-Path $taskRoot 'release/Drop-it 0.1/pinboard-service.exe'
$taskLauncher = Join-Path $taskRoot 'release/Drop-it 0.1/DropIt.exe'

foreach ($taskPath in @($taskSource, $taskTarget, $taskLauncher)) {
    if (-not (Test-Path -LiteralPath $taskPath -PathType Leaf)) { throw "Missing program: $taskPath" }
    $taskResolved = (Resolve-Path -LiteralPath $taskPath).Path
    if (-not $taskResolved.StartsWith($taskRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Update paths must stay inside this project.'
    }
}
$taskHash = (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash
$taskRunning = @(Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -eq $taskTarget -or $_.ExecutablePath -eq $taskLauncher
})
if ($CheckOnly) {
    Write-Output "UPDATE_READY=$taskSource"
    Write-Output "RUNNING_PROCESSES=$($taskRunning.Count)"
    Write-Output "SHA256=$taskHash"
    exit 0
}
if ($taskRunning.Count -gt 0) {
    throw 'Save your boards and close every Drop-it 0.1 window before applying the update. No files were replaced.'
}

# Replace only the program. Keep Template, Save, Temporary, databases and
# local service configuration untouched. Preserve the previous EXE in build.
$taskWork = Join-Path $taskRoot ('build/pinterest-update-' + [guid]::NewGuid().ToString('N'))
$taskWorkAbsolute = [System.IO.Path]::GetFullPath($taskWork)
if (-not $taskWorkAbsolute.StartsWith((Join-Path $taskRoot 'build') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Invalid update staging path.'
}
New-Item -ItemType Directory -Path $taskWork -Force | Out-Null
$taskStaged = Join-Path $taskWork 'pinboard-service.new.exe'
$taskBackup = Join-Path $taskWork 'pinboard-service.previous.exe'
Copy-Item -LiteralPath $taskSource -Destination $taskStaged
if ((Get-FileHash -LiteralPath $taskStaged -Algorithm SHA256).Hash -ne $taskHash) {
    throw 'Update staging checksum failed. The installed program was not changed.'
}
[System.IO.File]::Replace($taskStaged, $taskTarget, $taskBackup)
if ((Get-FileHash -LiteralPath $taskTarget -Algorithm SHA256).Hash -ne $taskHash) {
    throw "Update verification failed. Previous program: $taskBackup"
}
Write-Output 'Pinterest drag update applied. You can start Drop-it 0.1 again.'
Write-Output "PREVIOUS_PROGRAM=$taskBackup"
Write-Output 'Local ZIP and Setup archives, and GitHub Releases, retain their previously published version.'
