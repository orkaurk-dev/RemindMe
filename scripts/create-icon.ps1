$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$buildDir = Join-Path $PSScriptRoot '..\build'
if (-not (Test-Path $buildDir)) {
  New-Item -ItemType Directory -Path $buildDir | Out-Null
}

$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#0b1220'))

$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#0ea5e9'))
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#38bdf8'))
$darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#08111f'))

function New-RoundedPath {
  param(
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [int]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($X, $Y, $Radius, $Radius, 180, 90)
  $path.AddArc($X + $Width - $Radius, $Y, $Radius, $Radius, 270, 90)
  $path.AddArc($X + $Width - $Radius, $Y + $Height - $Radius, $Radius, $Radius, 0, 90)
  $path.AddArc($X, $Y + $Height - $Radius, $Radius, $Radius, 90, 90)
  $path.CloseFigure()
  return $path
}

$bgPath = New-RoundedPath -X 20 -Y 20 -Width 216 -Height 216 -Radius 56
$g.FillPath($bgBrush, $bgPath)

$innerPath = New-RoundedPath -X 54 -Y 54 -Width 148 -Height 148 -Radius 34
$g.FillPath($darkBrush, $innerPath)

# Simple bell-like mark with a reminder dot.
$g.FillEllipse($whiteBrush, 92, 78, 72, 78)
$g.FillRectangle($whiteBrush, 114, 150, 28, 26)
$g.FillEllipse($accentBrush, 114, 154, 28, 28)
$g.FillRectangle($accentBrush, 78, 184, 100, 12)
$g.FillRectangle($accentBrush, 108, 192, 40, 20)

$iconPath = Join-Path $buildDir 'icon.ico'
$iconHandle = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$stream = New-Object System.IO.FileStream($iconPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()

$g.Dispose()
$bmp.Dispose()

Write-Host $iconPath
