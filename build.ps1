$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (Test-Path -LiteralPath 'dist') {
    Remove-Item -LiteralPath 'dist' -Recurse -Force
}

foreach ($target in @('firefox', 'chrome')) {
    $targetDir = Join-Path 'dist' $target
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

    Copy-Item -Path (Join-Path 'src' '*') -Destination $targetDir -Force
    Copy-Item -Path (Join-Path 'manifests' "$target.json") -Destination (Join-Path $targetDir 'manifest.json') -Force

    $zipPath = Join-Path 'dist' "x-blocklist-$target.zip"
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    Compress-Archive -Path (Join-Path $targetDir '*') -DestinationPath $zipPath

    Write-Host "built dist/$target  (+ dist/x-blocklist-$target.zip)"
}
