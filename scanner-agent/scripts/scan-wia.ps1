# scan-wia.ps1
# Escanea usando el driver WIA del escáner (el que instaló el software de Kodak),
# SIN depender de NAPS2 ni de ningún otro programa externo.
#
# Soporta el alimentador automático de documentos (ADF): si hay varias hojas,
# escanea todas y regresa una imagen por página. El agente Node.js (server.js)
# luego las une en un solo PDF.
#
# Parámetros:
#   -OutputDir         Carpeta donde se guardan las imágenes escaneadas (la crea el agente).
#   -NombreDispositivo  (Opcional) Texto que debe contener el nombre del escáner
#                        (ej. "Kodak"), para elegirlo automáticamente sin preguntar.
#
# Salida: UNA sola línea JSON por stdout al final, por ejemplo:
#   {"ok":true,"files":["C:\\...\\pagina-0001.jpg","C:\\...\\pagina-0002.jpg"]}
# Cualquier otro mensaje de diagnóstico se manda a stderr, para no ensuciar el JSON.

param(
  [Parameter(Mandatory = $true)][string]$OutputDir,
  [string]$NombreDispositivo = ""
)

$ErrorActionPreference = 'Stop'
function Log($msg) { [Console]::Error.WriteLine($msg) }

# Constantes de propiedades WIA (estándar de Windows, no son específicas de Kodak)
$WIA_DPS_DOCUMENT_HANDLING_SELECT = 3088
$WIA_DPS_DOCUMENT_HANDLING_STATUS = 3087
$WIA_IPA_DATATYPE                 = 4104
$WIA_IPS_XRES                     = 6147
$WIA_IPS_YRES                     = 6148
$FEEDER_FLAG                      = 1
$COLOR_RGB                        = 3

# Códigos de error WIA que indican "ya no hay más hojas" (fin normal del ADF)
$WIA_ERROR_PAPER_EMPTY = -2145320957   # 0x80210003
$WIA_ERROR_ITEM_DELETED = -2145320954  # a veces se reporta así al vaciarse el feeder

function Set-WiaProperty($item, $propId, $value) {
  try {
    $item.Properties.Item($propId).Value = $value
  } catch {
    Log "Aviso: no se pudo ajustar la propiedad $propId ($($_.Exception.Message))"
  }
}

try {
  if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }

  $manager = New-Object -ComObject WIA.DeviceManager
  if ($manager.DeviceInfos.Count -eq 0) {
    Write-Output '{"ok":false,"error":"No se detecto ningun escaner por WIA. Verifica que el Kodak S2070 este encendido y conectado."}'
    exit 0
  }

  $deviceInfo = $null
  if ($NombreDispositivo) {
    foreach ($info in $manager.DeviceInfos) {
      $name = $info.Properties("Name").Value
      if ($name -like "*$NombreDispositivo*") { $deviceInfo = $info; break }
    }
    if (-not $deviceInfo) {
      Log "No se encontro un dispositivo cuyo nombre contenga '$NombreDispositivo'. Se usara el primero disponible."
    }
  }
  if (-not $deviceInfo) { $deviceInfo = $manager.DeviceInfos.Item(1) }

  Log "Usando dispositivo: $($deviceInfo.Properties('Name').Value)"
  $device = $deviceInfo.Connect()
  $item   = $device.Items.Item(1)

  # Intentar usar el alimentador automático (ADF) si el dispositivo lo soporta
  Set-WiaProperty $item $WIA_DPS_DOCUMENT_HANDLING_SELECT $FEEDER_FLAG
  Set-WiaProperty $item $WIA_IPA_DATATYPE $COLOR_RGB
  Set-WiaProperty $item $WIA_IPS_XRES 300
  Set-WiaProperty $item $WIA_IPS_YRES 300

  $files = @()
  $pageNum = 1
  $maxPages = 100  # límite de seguridad para no escanear infinitamente

  while ($pageNum -le $maxPages) {
    try {
      Log "Escaneando pagina $pageNum..."
      $image = $item.Transfer()
      if (-not $image) { break }

      $filePath = Join-Path $OutputDir ("pagina-{0:D4}.jpg" -f $pageNum)
      if (Test-Path $filePath) { Remove-Item $filePath -Force }
      $image.SaveFile($filePath)
      $files += $filePath
      $pageNum++

      # Si el dispositivo no tiene ADF (es un escáner plano/flatbed), Transfer()
      # normalmente solo entrega una página y no hay forma de "seguir". Revisamos
      # el estado del feeder para decidir si intentar otra pasada.
      $status = $null
      try { $status = $item.Properties.Item($WIA_DPS_DOCUMENT_HANDLING_STATUS).Value } catch {}
      if ($null -ne $status -and ($status -band 1) -eq 0) {
        # bit 1 = "hay papel en el feeder"; si no está prendido, ya no hay más hojas
        break
      }
      if ($null -eq $status) {
        # No se pudo leer el estado del feeder: asumimos que era una sola página (flatbed)
        break
      }
    } catch {
      $hresult = $_.Exception.HResult
      if ($hresult -eq $WIA_ERROR_PAPER_EMPTY -or $hresult -eq $WIA_ERROR_ITEM_DELETED -or $_.Exception.Message -match 'paper|papel') {
        Log "Fin del alimentador (no hay mas hojas)."
        break
      }
      throw
    }
  }

  if ($files.Count -eq 0) {
    Write-Output '{"ok":false,"error":"No se obtuvo ninguna pagina del escaner."}'
    exit 0
  }

  $jsonFiles = ($files | ForEach-Object { '"' + ($_ -replace '\\', '\\\\') + '"' }) -join ','
  Write-Output ('{"ok":true,"files":[' + $jsonFiles + ']}')

} catch {
  $errMsg = $_.Exception.Message -replace '"', '\"'
  Write-Output ('{"ok":false,"error":"' + $errMsg + '"}')
}
