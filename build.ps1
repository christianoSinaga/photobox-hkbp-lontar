# Build photobox: aplikasi Vue -> server/wwwroot, lalu publish server ke folder publish/.
# Cara pakai: double-click build.cmd (jangan jalankan file .ps1 ini langsung).

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Invoke-Step([string]$title, [string]$dir, [scriptblock]$action) {
    Write-Host "`n== $title ==" -ForegroundColor Cyan
    Push-Location (Join-Path $root $dir)
    try {
        & $action
        if ($LASTEXITCODE -ne 0) { throw "$title gagal (kode $LASTEXITCODE)." }
    } finally {
        Pop-Location
    }
}

try {
    Invoke-Step 'Menyiapkan dependency web' 'web' {
        if (Test-Path 'node_modules') { $global:LASTEXITCODE = 0 } else { npm install }
    }
    Invoke-Step 'Build aplikasi web' 'web' { npm run build }
    Invoke-Step 'Publish server' 'server' { dotnet publish -c Release -o ../publish }
    Write-Host "`nBuild selesai. Double-click start.cmd untuk menyalakan photobox." -ForegroundColor Green
} catch {
    Write-Host "`n$($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Jika publish gagal karena file terkunci, matikan dulu server yang sedang berjalan.' -ForegroundColor Yellow
    $failed = $true
}

try { Read-Host "`nTekan Enter untuk menutup" | Out-Null } catch { }
if ($failed) { exit 1 }
