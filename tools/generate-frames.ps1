# Membuat PNG frame contoh dari setiap JSON di web/public/templates.
# Lubang slot dibuat transparan sesuai koordinat di JSON.
# Jalankan dengan Windows PowerShell:  powershell -ExecutionPolicy Bypass -File tools\generate-frames.ps1
# Frame ini hanya placeholder; ganti dengan desain sendiri (mis. dari Canva) yang lubangnya sama.

Add-Type -AssemblyName System.Drawing

$templatesDir = Join-Path $PSScriptRoot '..\web\public\templates' | Resolve-Path
$fontFile = Join-Path $PSScriptRoot 'fonts\CormorantGaramond-VF.ttf'

$paper = [System.Drawing.Color]::FromArgb(255, 246, 242, 234)
$ink   = [System.Drawing.Color]::FromArgb(255, 16, 38, 30)
$gold  = [System.Drawing.Color]::FromArgb(255, 176, 138, 66)

# Font judul: Cormorant Garamond (file lokal), cadangan Georgia.
$fonts = New-Object System.Drawing.Text.PrivateFontCollection
$serifFamily = $null
if (Test-Path $fontFile) {
    $fonts.AddFontFile($fontFile)
    $serifFamily = $fonts.Families[0]
}

function New-SerifFont([float]$size) {
    if ($serifFamily) {
        return New-Object System.Drawing.Font($serifFamily, $size, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    }
    return New-Object System.Drawing.Font('Georgia', $size, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
}

# GDI+ tidak punya letter-spacing, jadi huruf digambar satu per satu.
function Write-Spaced($g, [string]$text, $font, $brush, [float]$centerX, [float]$y, [float]$spacing) {
    $format = [System.Drawing.StringFormat]::GenericTypographic
    $widths = @()
    foreach ($ch in $text.ToCharArray()) {
        $w = $g.MeasureString([string]$ch, $font, 10000, $format).Width
        if ($ch -eq ' ') { $w = $font.Size * 0.3 }
        $widths += $w
    }
    $total = ($widths | Measure-Object -Sum).Sum + $spacing * ($text.Length - 1)
    $x = $centerX - $total / 2
    $chars = $text.ToCharArray()
    for ($i = 0; $i -lt $chars.Length; $i++) {
        $g.DrawString([string]$chars[$i], $font, $brush, [float]$x, [float]$y, $format)
        $x += $widths[$i] + $spacing
    }
}

function New-Frame($t, [string]$outPath) {
    $w = [int]$t.width; $h = [int]$t.height
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    $g.Clear($paper)

    # Area teks di bawah slot terbawah.
    $slotsBottom = ($t.slots | ForEach-Object { $_.y + $_.h } | Measure-Object -Maximum).Maximum
    $areaTop = [float]$slotsBottom
    $areaH = $h - $areaTop
    $title = 'Natal Remaja Naposo'
    $sub = "HKBP LONTAR  $([char]0x00B7)  19 DESEMBER 2026"
    $format = [System.Drawing.StringFormat]::GenericTypographic

    # Judul dikecilkan sampai lebarnya muat (maks. 84% lebar frame).
    $titleSize = [Math]::Min($areaH * 0.34, $w * 0.11)
    $titleFont = New-SerifFont $titleSize
    while ($g.MeasureString($title, $titleFont, 10000, $format).Width -gt $w * 0.84) {
        $titleSize *= 0.95
        $titleFont = New-SerifFont $titleSize
    }
    $subSize = [Math]::Max(11, $titleSize * 0.2)
    $subFont = New-Object System.Drawing.Font('Segoe UI Semibold', [float]$subSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

    $titleH = $g.MeasureString($title, $titleFont, 10000, $format).Height
    $gap = $titleSize * 0.28
    $blockH = $titleH + $gap + 2 + $gap + $subSize
    $y = $areaTop + ($areaH - $blockH) / 2

    $center = New-Object System.Drawing.StringFormat($format)
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString($title, $titleFont, (New-Object System.Drawing.SolidBrush($ink)), [float]($w / 2), [float]$y, $center)

    # Garis emas pendek sebagai pemisah.
    $lineY = $y + $titleH + $gap
    $lineHalf = $titleSize * 0.45
    $g.FillRectangle((New-Object System.Drawing.SolidBrush($gold)), [float]($w / 2 - $lineHalf), [float]$lineY, [float]($lineHalf * 2), [float]2)

    Write-Spaced $g $sub $subFont (New-Object System.Drawing.SolidBrush($gold)) ($w / 2) ($lineY + 2 + $gap) ($subSize * 0.28)

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
