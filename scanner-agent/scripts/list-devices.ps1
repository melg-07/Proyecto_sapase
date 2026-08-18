# list-devices.ps1
# Muestra los escáneres que Windows detecta por WIA (Windows Image Acquisition).
# Sirve para confirmar el nombre EXACTO con el que aparece el Kodak S2070,
# y así poder ponerlo en config.json ("nombreDispositivo").
#
# Uso: clic derecho > "Ejecutar con PowerShell", o desde una consola:
#   powershell -ExecutionPolicy Bypass -File list-devices.ps1

$ErrorActionPreference = 'Stop'

try {
  $manager = New-Object -ComObject WIA.DeviceManager
  if ($manager.DeviceInfos.Count -eq 0) {
    Write-Host "No se detectó ningún escáner por WIA en esta computadora." -ForegroundColor Yellow
    Write-Host "Verifica que el Kodak S2070 esté encendido, conectado, y que su driver esté instalado." -ForegroundColor Yellow
    exit 0
  }

  Write-Host "Escáneres/dispositivos detectados por WIA:" -ForegroundColor Cyan
  Write-Host ""
  foreach ($info in $manager.DeviceInfos) {
    $name = $info.Properties("Name").Value
    $id   = $info.DeviceID
    Write-Host "  Nombre: $name"
    Write-Host "  ID:     $id"
    Write-Host ""
  }
  Write-Host "Copia el 'Nombre' que corresponda al Kodak S2070 dentro de config.json, en 'nombreDispositivo'." -ForegroundColor Green
} catch {
  Write-Host "Error al listar dispositivos: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ""
  Write-Host "Si este error aparece, es probable que el driver del Kodak S2070 NO tenga soporte WIA" -ForegroundColor Yellow
  Write-Host "habilitado (solo TWAIN/ISIS). Revisa el README.md, sección 'Si el escáner no aparece por WIA'." -ForegroundColor Yellow
}
