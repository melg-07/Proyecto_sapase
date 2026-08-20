param(
  [Parameter(Mandatory = $true)][string]$OutputDir,
  [string]$NombreDispositivo = ""
)

$ErrorActionPreference = 'Stop'

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

function Log($msg) { [Console]::Error.WriteLine($msg) }

$resultPath = Join-Path $OutputDir 'result.json'
function Write-Result($jsonString) {
  [System.IO.File]::WriteAllText($resultPath, $jsonString, (New-Object System.Text.UTF8Encoding($false)))
  Write-Output $jsonString
}

# Constantes de propiedades WIA (estandar de Windows, no son especificas de Kodak)
$WIA_DPS_DOCUMENT_HANDLING_SELECT = 3088
$WIA_DPS_DOCUMENT_HANDLING_STATUS = 3087
$WIA_IPA_DATATYPE                 = 4103
$WIA_IPS_XRES                     = 6147
$WIA_IPS_YRES                     = 6148
$FEEDER_FLAG                      = 1
$COLOR_RGB                        = 3

# Codigos de error WIA que indican "ya no hay mas hojas" (fin normal del ADF)
$WIA_ERROR_PAPER_EMPTY = -2145320957   # 0x80210003
$WIA_ERROR_ITEM_DELETED = -2145320954  # a veces se reporta asi al vaciarse el feeder

# IMPORTANTE: algunos drivers (como el del Kodak S2070) no soportan buscar una
# propiedad directamente por su PropertyID con .Properties.Item($id) — eso es
# lo que causaba el error "indice fuera del intervalo" en las 4 propiedades.
# En su lugar, recorremos la coleccion de propiedades y comparamos el
# PropertyID de cada una, que es la forma compatible con mas escaneres.
function Get-WiaProperty($item, $propId) {
  foreach ($prop in $item.Properties) {
    if ($prop.PropertyID -eq $propId) { return $prop }
  }
  return $null
}

function Set-WiaProperty($item, $propId, $value) {
  $prop = Get-WiaProperty $item $propId
  if (-not $prop) {
    Log "Aviso: el dispositivo no tiene la propiedad $propId, se omite."
    return
  }
  try {
    $prop.Value = $value
  } catch {
    Log "Aviso: no se pudo ajustar la propiedad $propId ($($_.Exception.Message))"
  }
}

try {
  if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }

  $manager = New-Object -ComObject WIA.DeviceManager
  if ($manager.DeviceInfos.Count -eq 0) {
    Write-Result '{"ok":false,"error":"No se detecto ningun escaner por WIA. Verifica que el Kodak S2070 este encendido y conectado."}'
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
  Log "Formatos soportados por el dispositivo:"
  foreach ($fmt in $item.Formats) {
    Log " - $fmt"
  }

  # Intentar usar el alimentador automatico (ADF) si el dispositivo lo soporta
  Set-WiaProperty $item $WIA_DPS_DOCUMENT_HANDLING_SELECT $FEEDER_FLAG

  $files = @()
  $pageNum = 1
  $maxPages = 100  # limite de seguridad para no escanear infinitamente

  while ($pageNum -le $maxPages) {
    try {
        Log "Escaneando pagina $pageNum..."

        $image = $null
    $format = "{B96B3CB1-0728-11D3-9D7B-0000F81EF32E}"

Log "Usando formato: $format"

$image = $item.Transfer($format)

Log "Transfer() exitoso."
Log "Formato real de imagen: $ ($image.FormatID)"

        if (-not $image) {
            throw "El escaner rechazo todos los formatos disponibles."
        }

        Log "Transfer() completado."

        $filePath = Join-Path $OutputDir ("pagina-{0:D4}.jpg" -f $pageNum)

        if (Test-Path $filePath) {
            Remove-Item $filePath -Force
        }

        Log "Guardando en: $filePath"

        $image.SaveFile($filePath)

        Log "SaveFile() completado."

        $files += $filePath
        $pageNum++

        $statusProp = Get-WiaProperty $item $WIA_DPS_DOCUMENT_HANDLING_STATUS
        $status = $null

        if ($statusProp) {
            try {
                $status = $statusProp.Value
            }
            catch {}
        }

        if ($null -ne $status -and ($status -band 1) -eq 0) {
            break
        }

        if ($null -eq $status) {
            break
        }
    }
    catch {
        $hresult = $_.Exception.HResult

        if (
            $hresult -eq $WIA_ERROR_PAPER_EMPTY -or
            $hresult -eq $WIA_ERROR_ITEM_DELETED -or
            $_.Exception.Message -match 'paper|papel'
        ) {
            Log "Fin del alimentador (no hay mas hojas)."
            break
        }

        Log "HRESULT exacto: $hresult (0x$($hresult.ToString('X')))"
        throw
    }
}
  if ($files.Count -eq 0) {
    Write-Result '{"ok":false,"error":"No se obtuvo ninguna pagina del escaner."}'
    exit 0
  }

  $jsonFiles = ($files | ForEach-Object { '"' + ($_ -replace '\\', '\\\\') + '"' }) -join ','
  Write-Result ('{"ok":true,"files":[' + $jsonFiles + ']}')

} catch {
  $errMsg = $_.Exception.Message -replace '"', '\"' -replace "`r`n", ' ' -replace "`n", ' '
  Write-Result ('{"ok":false,"error":"' + $errMsg + '"}')
}
