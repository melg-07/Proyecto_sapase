param([string]$OutputDir)

$ErrorActionPreference = 'Stop'
$files = @()

try {
  Add-Type -AssemblyName System.Drawing
  $wia = New-Object -ComObject WIA.CommonDialog
  $device = $wia.ShowSelectDevice(1, $false, $false)
  if (-not $device) {
    Write-Output '{"ok":false,"error":"No se seleccionó ningún escáner."}'
    exit 0
  }

  $item = $device.Items(1)
  if (-not $item) {
    Write-Output '{"ok":false,"error":"El escáner no devolvió un elemento válido."}'
    exit 0
  }

  if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }

  $image = $item.Transfer()
  if (-not $image) {
    Write-Output '{"ok":false,"error":"No se obtuvo ninguna imagen del escáner."}'
    exit 0
  }

  $filePath = Join-Path $OutputDir ("scan-{0}.jpg" -f [DateTime]::Now.ToString('yyyyMMdd-HHmmss'))
  $image.SaveFile($filePath)
  $files += $filePath

  $result = [ordered]@{
    ok = $true
    files = $files
  }
  $result | ConvertTo-Json -Compress
} catch {
  Write-Output ('{"ok":false,"error":"' + ($_.Exception.Message -replace '"','\\"') + '"}')
}
