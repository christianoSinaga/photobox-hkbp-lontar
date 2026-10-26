# Membuat PNG frame contoh dari setiap JSON di web/public/templates.
# Lubang slot dibuat transparan sesuai koordinat di JSON.
# Jalankan dengan Windows PowerShell:  powershell -ExecutionPolicy Bypass -File tools\generate-frames.ps1
# Frame ini hanya placeholder; ganti dengan desain sendiri (mis. dari Canva) yang lubangnya sama.

Add-Type -AssemblyName System.Drawing

$templatesDir = Join-Path $PSScriptRoot '..\web\public\templates' | Resolve-Path

$red      = [System.Drawing.Color]::FromArgb(255, 150, 24, 34)
$redDark  = [System.Drawing.Color]::FromArgb(255, 104, 12, 20)
$green    = [System.Drawing.Color]::FromArgb(255, 15, 61, 42)
$gold     = [System.Drawing.Color]::FromArgb(255, 212, 166, 58)
$white    = [System.Drawing.Color]::FromArgb(255, 255, 250, 242)

function Get-StarPoints([float]$cx, [float]$cy, [float]$r) {
    $points = @()
    for ($i = 0; $i -lt 10; $i++) {
        $radius = if ($i % 2 -eq 0) { $r } else { $r * 0.42 }
        $angle = -[Math]::PI / 2 + $i * [Math]::PI / 5
        $points += New-Object System.Drawing.PointF(($cx + $radius * [Math]::Cos($angle)), ($cy + $radius * [Math]::Sin($angle)))
    }
    return , $points
}

function New-Frame($t, [string]$outPath) {
    $w = [int]$t.width; $h = [int]$t.height
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Latar merah bergradasi.
    $full = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($full, $red, $redDark, 90.0)
    $g.FillRectangle($bg, $full)

    # Area teks di bawah slot terbawah, berlatar hijau tua.
    $slotsBottom = ($t.slots | ForEach-Object { $_.y + $_.h } | Measure-Object -Maximum).Maximum
    $areaTop = [int]$slotsBottom + 30
    $areaBottom = $h - 40
    $areaRect = New-Object System.Drawing.Rectangle(40, $areaTop, ($w - 80), ($areaBottom - $areaTop))
    $g.FillRectangle((New-Object System.Drawing.SolidBrush($green)), $areaRect)
    $g.DrawRectangle((New-Object System.Drawing.Pen($gold, 3)), $areaRect)

    # Bingkai luar emas ganda.
    $g.DrawRectangle((New-Object System.Drawing.Pen($gold, 6)), 16, 16, ($w - 32), ($h - 32))
    $g.DrawRectangle((New-Object System.Drawing.Pen($gold, 2)), 28, 28, ($w - 56), ($h - 56))

    # Garis emas di sekeliling setiap lubang.
    $slotPen = New-Object System.Drawing.Pen($gold, 8)
    foreach ($s in $t.slots) {
        $g.DrawRectangle($slotPen, ($s.x - 4), ($s.y - 4), ($s.w + 8), ($s.h + 8))
    }

    # Teks.
    $areaH = $areaBottom - $areaTop
    $titleSize = [Math]::Min($areaH * 0.42, $w * 0.085)
    $subSize = $titleSize * 0.36
    $titleFont = New-Object System.Drawing.Font('Georgia', [float]$titleSize, ([System.Drawing.FontStyle]::Bold -bor [System.Drawing.FontStyle]::Italic), [System.Drawing.GraphicsUnit]::Pixel)
    $subFont = New-Object System.Drawing.Font('Segoe UI Semibold', [float]$subSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $title = 'Natal Naposo'
    $sub = "HKBP Lontar  $([char]0x00B7)  19 Desember 2026"
    $titleMeasure = $g.MeasureString($title, $titleFont)
    $subMeasure = $g.MeasureString($sub, $subFont)
    $blockH = $titleMeasure.Height + $subMeasure.Height
    $y = $areaTop + ($areaH - $blockH) / 2
    $center = New-Object System.Drawing.StringFormat
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString($title, $titleFont, (New-Object System.Drawing.SolidBrush($gold)), [float]($w / 2), [float]$y, $center)
    $g.DrawString($sub, $subFont, (New-Object System.Drawing.SolidBrush($white)), [float]($w / 2), [float]($y + $titleMeasure.Height), $center)

    # Bintang di kiri dan kanan judul.
    $starR = $titleSize * 0.32
    $starY = $y + $titleMeasure.Height * 0.52
    $offset = $titleMeasure.Width / 2 + $starR * 1.6
    $goldBrush = New-Object System.Drawing.SolidBrush($gold)
    $g.FillPolygon($goldBrush, (Get-StarPoints ($w / 2 - $offset) $starY $starR))
    $g.FillPolygon($goldBrush, (Get-StarPoints ($w / 2 + $offset) $starY $starR))

    # Lubang transparan, tepat sesuai slot.
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $clear = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Transparent)
    foreach ($s in $t.slots) {
        $g.FillRectangle($clear, [int]$s.x, [int]$s.y, [int]$s.w, [int]$s.h)
    }

    $g.Dispose()
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

Get-ChildItem $templatesDir -Filter '*.json' | Where-Object Name -ne 'index.json' | ForEach-Object {
    $t = Get-Content $_.FullName -Raw | ConvertFrom-Json
    $out = Join-Path $templatesDir ([IO.Path]::GetFileName($t.frame))
    New-Frame $t $out
    Write-Host "Dibuat: $out"
}
