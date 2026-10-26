# Menyalakan photobox: server hasil publish + Chrome mode kiosk ke http://localhost:4000.
# Cara pakai: klik kanan file ini -> "Run with PowerShell".
# Jendela PowerShell ini adalah server. JANGAN ditutup selama acara.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$publishDir = Join-Path $root 'publish'
$serverExe = Join-Path $publishDir 'Photobox.Server.exe'
$storageDir = Join-Path $root 'server'
$appUrl = 'http://localhost:4000'
# Profil Chrome terpisah: kiosk selalu terbuka walau Chrome biasa sedang jalan.
$profileDir = Join-Path $env:LOCALAPPDATA 'PhotoboxKiosk'

function Stop-WithMessage([string]$message) {
    Write-Host $message -ForegroundColor Red
    try { Read-Host 'Tekan Enter untuk menutup' | Out-Null } catch { }
    exit 1
}

function Test-Server {
    try {
        Invoke-WebRequest "$appUrl/api/config" -UseBasicParsing -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-Path $serverExe)) { Stop-WithMessage 'Aplikasi belum di-build. Jalankan build.ps1 dulu.' }

$server = $null
if (Test-Server) {
    Write-Host 'Server sudah menyala, langsung membuka Chrome.' -ForegroundColor Yellow
} else {
    Write-Host 'Menyalakan server...' -ForegroundColor Cyan
    $server = Start-Process -FilePath $serverExe -ArgumentList "--StorageDir `"$storageDir`"" `
        -WorkingDirectory $publishDir -NoNewWindow -PassThru
    $ready = $false
    for ($i = 0; $i -lt 30 -and -not $server.HasExited; $i++) {
        if (Test-Server) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { Stop-WithMessage 'Server gagal menyala. Lihat pesan di atas (mungkin port 4000/3000 sedang dipakai).' }
}

$browser = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if ($browser) {
    Start-Process -FilePath $browser -ArgumentList @(
        '--kiosk', $appUrl,
        "--user-data-dir=`"$profileDir`"",
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-session-crashed-bubble',
        '--disable-features=Translate',
        '--disable-pinch',
        '--overscroll-history-navigation=0',
        # Izin kamera otomatis disetujui. Profil ini hanya dipakai untuk photobox.
        '--use-fake-ui-for-media-stream'
    )
} else {
    Write-Host "Chrome tidak ditemukan. Buka $appUrl secara manual." -ForegroundColor Yellow
}

if ($server) {
    Write-Host ''
    Write-Host 'Photobox berjalan.' -ForegroundColor Green
    Write-Host 'JANGAN tutup jendela ini selama acara. Untuk mematikan server: tekan Ctrl+C atau tutup jendela ini.'
    $server.WaitForExit()
}
