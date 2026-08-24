param(
  [Parameter(Mandatory = $true)][string]$OutputDir,
  [string]$NombreDispositivo = ""
)

$ErrorActionPreference = 'Stop'

# Necesario para convertir las imágenes a JPEG real
Add-Type -AssemblyName System.Drawing

# ============================================================
# UTF-8
# ============================================================

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
}
catch {}

function Log($msg) {
  [Console]::Error.WriteLine($msg)
}

# ============================================================
# RESULTADO
# ============================================================

$resultPath = Join-Path $OutputDir 'result.json'

function Write-Result($jsonString) {

  [System.IO.File]::WriteAllText(
    $resultPath,
    $jsonString,
    (New-Object System.Text.UTF8Encoding($false))
  )

  Write-Output $jsonString
}

# ============================================================
# PROPIEDADES WIA
# ============================================================

$WIA_DPS_DOCUMENT_HANDLING_SELECT = 3088

$WIA_IPA_DATATYPE = 4103
$WIA_IPS_XRES     = 6147
$WIA_IPS_YRES     = 6148

$FEEDER_FLAG = 1
$COLOR_RGB   = 3

# ============================================================
# ERRORES WIA
# ============================================================

$WIA_ERROR_PAPER_EMPTY  = -2145320957
$WIA_ERROR_ITEM_DELETED = -2145320954

# 0x80070057 - parámetro no válido.
# En tu Kodak aparece cuando ya no puede realizar otro Transfer.
$WIA_ERROR_INVALID_PARAMETER = -2147024809

# ============================================================
# OBTENER PROPIEDAD WIA
# ============================================================

function Get-WiaProperty($item, $propId) {

  foreach ($prop in $item.Properties) {

    if ($prop.PropertyID -eq $propId) {
      return $prop
    }
  }

  return $null
}

# ============================================================
# ESTABLECER PROPIEDAD WIA
# ============================================================

function Set-WiaProperty($item, $propId, $value) {

  $prop = Get-WiaProperty $item $propId

  if (-not $prop) {

    Log "Aviso: el dispositivo no tiene la propiedad $propId, se omite."

    return
  }

  try {

    $prop.Value = $value

  }
  catch {

    Log "Aviso: no se pudo ajustar la propiedad $propId : $($_.Exception.Message)"
  }
}

# ============================================================
# INICIO
# ============================================================

try {

  # ==========================================================
  # CREAR CARPETA DE SALIDA
  # ==========================================================

  if (-not (Test-Path $OutputDir)) {

    New-Item `
      -ItemType Directory `
      -Force `
      -Path $OutputDir |
      Out-Null
  }

  # ==========================================================
  # CONECTAR CON WIA
  # ==========================================================

  Log "Conectando con WIA..."

  $manager = New-Object -ComObject WIA.DeviceManager

  if ($manager.DeviceInfos.Count -eq 0) {

    Write-Result '{"ok":false,"error":"No se detecto ningun escaner por WIA. Verifica que el Kodak S2070 este encendido y conectado."}'

    exit 0
  }

  # ==========================================================
  # BUSCAR DISPOSITIVO
  # ==========================================================

  $deviceInfo = $null

  if ($NombreDispositivo) {

    foreach ($info in $manager.DeviceInfos) {

      $name = $info.Properties("Name").Value

      if ($name -like "*$NombreDispositivo*") {

        $deviceInfo = $info

        break
      }
    }

    if (-not $deviceInfo) {

      Log "No se encontro '$NombreDispositivo'."

      Log "Se utilizara el primer dispositivo disponible."
    }
  }

  if (-not $deviceInfo) {

    $deviceInfo = $manager.DeviceInfos.Item(1)
  }

  Log "Usando dispositivo: $($deviceInfo.Properties('Name').Value)"

  # ==========================================================
  # CONECTAR AL ESCANER
  # ==========================================================

  $device = $deviceInfo.Connect()

  $item = $device.Items.Item(1)

  # ==========================================================
  # MOSTRAR FORMATOS
  # ==========================================================

  Log "Formatos soportados por el dispositivo:"

  foreach ($fmt in $item.Formats) {

    Log " - $fmt"
  }

  # ==========================================================
  # CONFIGURAR ALIMENTADOR
  # ==========================================================

  Set-WiaProperty `
    $item `
    $WIA_DPS_DOCUMENT_HANDLING_SELECT `
    $FEEDER_FLAG

  # ==========================================================
  # CONFIGURAR COLOR
  # ==========================================================

  Set-WiaProperty `
    $item `
    $WIA_IPA_DATATYPE `
    $COLOR_RGB

  # ==========================================================
  # RESOLUCION
  # ==========================================================

  Set-WiaProperty `
    $item `
    $WIA_IPS_XRES `
    300

  Set-WiaProperty `
    $item `
    $WIA_IPS_YRES `
    300

  Log "Configuracion: COLOR RGB, 300 DPI."

  # ==========================================================
  # VARIABLES DEL ESCANEO
  # ==========================================================

  $files = @()

  $pageNum = 1

  # Limite de seguridad
  $maxPages = 100

  # ==========================================================
  # ESCANEAR TODAS LAS HOJAS
  # ==========================================================

  while ($pageNum -le $maxPages) {

    try {

      Log "=========================================="
      Log "Escaneando pagina $pageNum..."
      Log "=========================================="

      # ------------------------------------------------------
      # FORMATO QUE YA FUNCIONA EN TU KODAK S2070
      # ------------------------------------------------------

      $format = "{B96B3CB1-0728-11D3-9D7B-0000F81EF32E}"

      Log "Usando formato: $format"

      # ------------------------------------------------------
      # ESCANEAR
      # ------------------------------------------------------

      $image = $item.Transfer($format)

      if (-not $image) {

        throw "El escaner no devolvio ninguna imagen."
      }

      Log "Transfer() exitoso."

      Log "Formato real de imagen: $($image.FormatID)"

      # ------------------------------------------------------
      # ARCHIVO JPEG
      # ------------------------------------------------------

      $filePath = Join-Path `
        $OutputDir `
        ("pagina-{0:D4}.jpg" -f $pageNum)

      if (Test-Path $filePath) {

        Remove-Item $filePath -Force
      }

      # ------------------------------------------------------
      # ARCHIVO TEMPORAL
      # ------------------------------------------------------

      $tempFile = Join-Path `
        $OutputDir `
        ("temp-{0:D4}.img" -f $pageNum)

      try {

        if (Test-Path $tempFile) {

          Remove-Item $tempFile -Force
        }

        # ----------------------------------------------------
        # GUARDAR IMAGEN ORIGINAL
        # ----------------------------------------------------

        Log "Guardando imagen original..."

        $image.SaveFile($tempFile)

        Log "Imagen original guardada."

        # ----------------------------------------------------
        # ABRIR IMAGEN
        # ----------------------------------------------------

        Log "Convirtiendo a JPEG..."

        $bitmap = [System.Drawing.Image]::FromFile($tempFile)

        try {

          # --------------------------------------------------
          # GUARDAR JPEG REAL
          # --------------------------------------------------

          $bitmap.Save(
            $filePath,
            [System.Drawing.Imaging.ImageFormat]::Jpeg
          )

        }
        finally {

          $bitmap.Dispose()
        }

        Log "JPEG creado correctamente."

      }
      finally {

        # ----------------------------------------------------
        # ELIMINAR TEMPORAL
        # ----------------------------------------------------

        if (Test-Path $tempFile) {

          Remove-Item $tempFile -Force
        }
      }

      # ------------------------------------------------------
      # AGREGAR PAGINA A LA LISTA
      # ------------------------------------------------------

      $files += $filePath

      Log "Pagina $pageNum guardada correctamente."

      Log "Archivo: $filePath"

      # ------------------------------------------------------
      # SIGUIENTE PAGINA
      # ------------------------------------------------------

      $pageNum++

      Log "Comprobando si hay otra hoja..."

      # No usamos la propiedad 3087.
      #
      # En tu Kodak S2070 esa propiedad no está disponible
      # correctamente.
      #
      # Por eso el siguiente Transfer() determina si todavía
      # hay hojas.

    }
    catch {

      $hresult = $_.Exception.HResult

      $message = $_.Exception.Message

      Log "------------------------------------------"
      Log "Transfer() finalizado."
      Log "Mensaje: $message"
      Log "HRESULT: $hresult"
      Log "------------------------------------------"

      # ======================================================
      # FIN DEL ALIMENTADOR
      # ======================================================

      if (
        $files.Count -gt 0 -and
        (
          $hresult -eq $WIA_ERROR_PAPER_EMPTY -or
          $hresult -eq $WIA_ERROR_ITEM_DELETED -or
          $hresult -eq $WIA_ERROR_INVALID_PARAMETER -or
          $message -match 'paper|papel|empty|vac'
        )
      ) {

        Log "No quedan mas hojas en el alimentador."

        Log "Total de paginas escaneadas: $($files.Count)"

        break
      }

      # ======================================================
      # ERROR REAL
      # ======================================================

      Log "Error inesperado durante el escaneo."

      throw
    }
  }

  # ==========================================================
  # VALIDAR QUE HAYA ARCHIVOS
  # ==========================================================

  if ($files.Count -eq 0) {

    Write-Result '{"ok":false,"error":"No se obtuvo ninguna pagina del escaner."}'

    exit 0
  }

  # ==========================================================
  # CREAR JSON DE ARCHIVOS
  # ==========================================================

  $jsonFiles = (
    $files |
    ForEach-Object {

      '"' + ($_ -replace '\\', '\\\\') + '"'

    }
  ) -join ','

  # ==========================================================
  # RESULTADO FINAL
  # ==========================================================

  Log "=========================================="
  Log "ESCANEO TERMINADO"
  Log "Paginas escaneadas: $($files.Count)"
  Log "=========================================="

  Write-Result (
    '{"ok":true,"files":[' +
    $jsonFiles +
    ']}'
  )
}

# ============================================================
# ERROR GENERAL
# ============================================================

catch {

  $errMsg = $_.Exception.Message `
    -replace '"', '\"' `
    -replace "`r`n", ' ' `
    -replace "`n", ' '

  Log "ERROR GENERAL: $errMsg"

  Write-Result (
    '{"ok":false,"error":"' +
    $errMsg +
    '"}'
  )
}