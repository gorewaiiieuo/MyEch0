param(
    [ValidatePattern('^[a-z0-9]+(?:[._-][a-z0-9]+)*/[a-z0-9]+(?:[._-][a-z0-9]+)*$')]
    [string]$Repository = 'yubaodocker1125/myech0',
    [ValidatePattern('^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$')]
    [string]$Tag = ('local-' + (Get-Date -Format 'yyyyMMdd-HHmmss')),
    [switch]$UsePrebuilt
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    $dockerPath = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
    if (-not (Test-Path -LiteralPath $dockerPath)) { throw 'Docker Desktop is required.' }
} else { $dockerPath = $docker.Source }
$env:Path = (Split-Path -Parent $dockerPath) + ';' + $env:Path
function Assert-LastExit([string]$Message) { if ($LASTEXITCODE -ne 0) { throw $Message } }
Push-Location -LiteralPath $root
try {
    $commit = (& git rev-parse HEAD).Trim()
    Assert-LastExit 'Cannot determine source commit.'
    $dirty = & git status --porcelain --untracked-files=normal
    Assert-LastExit 'Cannot inspect source changes.'
    if ($dirty) { throw 'Commit the source changes before publishing so the image matches a recoverable source revision.' }
    $versionImage = "${Repository}:$Tag"
    if ($UsePrebuilt) {
        $receiptPath = Join-Path $root 'backend-artifacts/build-receipt.json'
        if (-not (Test-Path -LiteralPath $receiptPath)) { throw 'Missing prebuilt binary receipt; use the normal source build.' }
        $receipt = [IO.File]::ReadAllText($receiptPath) | ConvertFrom-Json
        $binaryPath = Join-Path $root 'backend-artifacts/ech0-linux-amd64'
        if ($receipt.commit -ne $commit -or $receipt.sha256 -ne (Get-FileHash -LiteralPath $binaryPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
            throw 'Prebuilt binary does not match this commit. Rebuild it or use the normal source build.'
        }
        $dockerfile = 'Dockerfile.prebuilt-local'
    } else { $dockerfile = 'Dockerfile.local' }
    & $dockerPath build --platform linux/amd64 --build-arg "BUILD_COMMIT=$commit" -f $dockerfile -t $versionImage .
    Assert-LastExit 'Image build failed.'
    # Test this exact image with disposable data before either tag is uploaded.
    $testName = 'myech0-release-check-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
    try {
        & $dockerPath run -d --name $testName --label myech0.temporary=release-check $versionImage | Out-Null
        Assert-LastExit 'Cannot start the release check.'
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            & $dockerPath exec $testName wget -q -O /dev/null http://127.0.0.1:6277/api/init/status 2>$null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Start-Sleep -Seconds 1
        }
        if (-not $ready) { throw 'The new image did not start successfully; nothing was published.' }
    } finally {
        & $dockerPath rm -f -v $testName 2>$null | Out-Null
    }
    & $dockerPath push $versionImage
    Assert-LastExit 'Version upload failed; latest was not changed.'
    & $dockerPath tag $versionImage "${Repository}:latest"
    Assert-LastExit 'Cannot tag latest.'
    & $dockerPath push "${Repository}:latest"
    Assert-LastExit 'Latest upload failed.'
    Write-Host "Published $versionImage and ${Repository}:latest"
    Write-Host 'The NAS will detect latest on its next scheduled check.'
} finally { Pop-Location }
