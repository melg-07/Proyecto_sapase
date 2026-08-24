param(
  [Parameter(Mandatory = $true)][string]$OutputDir,
  [string]$NombreDispositivo = ""
)

$ErrorActionPreference = 'Stop'
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

$WIA_DPS_DOCUMENT_HANDLING_STATUS = 3087
$WIA_DPS_DOCUMENT_HANDLING_SELECT = 3088

# Cantidad de páginas del ADF
$WIA_IPS_PAGES = 3096

# Tipo de imagen
$WIA_IPA_DATATYPE = 4103

# Resolución
$WIA_IPS_XRES = 6147
$WIA_IPS_YRES = 6148

# Valores
$FEEDER_FLAG = 1
$COLOR_RGB = 3

# ============================================================
# ERRORES
# ============================================================

$WIA_ERROR_PAPER_EMPTY = -2145320957
$WIA_ERROR_ITEM_DELETED = -2145320954

# ============================================================
# BUSCAR PROPIEDAD
# ============================================================

function Get-WiaProperty($object, $propId) {

    try {

        foreach ($prop in $object.Properties) {

            if ($prop.PropertyID -eq $propId) {

                return $prop
            }
        }
    }
    catch {

        Log "No se pudo consultar la propiedad $propId"
    }

    return $null
}

# ============================================================
# ESTABLECER PROPIEDAD
# ============================================================

function Set-WiaProperty($object, $propId, $value) {

    $prop = Get-WiaProperty $object $propId

    if (-not $prop) {

        Log "Aviso: no existe la propiedad $propId."

        return $false
    }

    try {

        $prop.Value = $value

        Log "Propiedad $propId configurada en $value"

        return $true
    }
    catch {

        Log "No se pudo configurar propiedad $propId : $($_.Exception.Message)"

        return $false
    }
}

# ============================================================
# INICIO
# ============================================================

try {

    # --------------------------------------------------------
    # Crear carpeta
    # --------------------------------------------------------

    if (-not (Test-Path $OutputDir)) {

        New-Item `
            -ItemType Directory `
            -Force `
            -Path $OutputDir |
            Out-Null
    }

    Log "Conectando con WIA..."

    # --------------------------------------------------------
    # WIA
    # --------------------------------------------------------

    $manager = New-Object -ComObject WIA.DeviceManager

    if ($manager.DeviceInfos.Count -eq 0) {

        Write-Result '{"ok":false,"error":"No se detecto ningun escaner por WIA."}'

        exit 0
    }

    # --------------------------------------------------------
    # BUSCAR KODAK
    # --------------------------------------------------------

    $deviceInfo = $null

    if ($NombreDispositivo) {

        foreach ($info in $manager.DeviceInfos) {

            $name = $info.Properties("Name").Value

            if ($name -like "*$NombreDispositivo*") {

                $deviceInfo = $info

                break
            }
        }
    }

    if (-not $deviceInfo) {

        $deviceInfo = $manager.DeviceInfos.Item(1)
    }

    $deviceName = $deviceInfo.Properties("Name").Value

    Log "Usando dispositivo: $deviceName"

    # --------------------------------------------------------
    # CONECTAR
    # --------------------------------------------------------

    $device = $deviceInfo.Connect()

    $item = $device.Items.Item(1)

    # ========================================================
    # MOSTRAR FORMATOS
    # ========================================================

    Log "Formatos soportados por el dispositivo:"

    foreach ($fmt in $item.Formats) {

        Log " - $fmt"
    }

    # ========================================================
    # CONFIGURAR ALIMENTADOR
    #
    # IMPORTANTE:
    # Estas propiedades se intentan primero sobre el DEVICE.
    # ========================================================

    Log "Configurando alimentador..."

    $feederConfigured = Set-WiaProperty `
        $device `
        $WIA_DPS_DOCUMENT_HANDLING_SELECT `
        $FEEDER_FLAG

    if (-not $feederConfigured) {

        Log "Intentando configurar alimentador sobre ITEM..."

        Set-WiaProperty `
            $item `
            $WIA_DPS_DOCUMENT_HANDLING_SELECT `
            $FEEDER_FLAG
    }

    # ========================================================
    # CONFIGURAR TODAS LAS PAGINAS
    #
    # 0 = todas las páginas disponibles en el ADF.
    # ========================================================

    Log "Configurando escaneo de todas las paginas..."

    $pagesConfigured = Set-WiaProperty `
        $device `
        $WIA_IPS_PAGES `
        0

    if (-not $pagesConfigured) {

        Log "Intentando propiedad 3096 sobre ITEM..."

        Set-WiaProperty `
            $item `
            $WIA_IPS_PAGES `
            0
    }

    # ========================================================
    # COLOR
    # ========================================================

    Log "Configurando color RGB..."

    Set-WiaProperty `
        $item `
        $WIA_IPA_DATATYPE `
        $COLOR_RGB

    # ========================================================
    # RESOLUCION
    # ========================================================

    Log "Configurando resolucion 300 DPI..."

    Set-WiaProperty `
        $item `
        $WIA_IPS_XRES `
        300

    Set-WiaProperty `
        $item `
        $WIA_IPS_YRES `
        300

    Log "Configuracion terminada."

    # ========================================================
    # ARCHIVOS
    # ========================================================

    $files = @()

    $pageNum = 1

    $maxPages = 100

    # ========================================================
    # FORMATO JPEG
    # ========================================================

    $format = "{B96B3CB1-0728-11D3-9D7B-0000F81EF32E}"

    # ========================================================
    # ESCANEAR
    # ========================================================

    while ($pageNum -le $maxPages) {

        Log "=========================================="

        Log "Escaneando pagina $pageNum..."

        Log "Usando formato: $format"

        try {

            # ------------------------------------------------
            # TRANSFER
            # ------------------------------------------------

            $image = $item.Transfer($format)

            if (-not $image) {

                throw "El escaner no devolvio ninguna imagen."
            }

            Log "Transfer() exitoso."

            Log "Formato real: $($image.FormatID)"

            # ------------------------------------------------
            # ARCHIVO
            # ------------------------------------------------

            $filePath = Join-Path `
                $OutputDir `
                ("pagina-{0:D4}.jpg" -f $pageNum)

            $tempFile = Join-Path `
                $OutputDir `
                ("temp-{0:D4}.img" -f $pageNum)

            # ------------------------------------------------
            # GUARDAR ORIGINAL
            # ------------------------------------------------

            if (Test-Path $tempFile) {

                Remove-Item $tempFile -Force
            }

            Log "Guardando imagen original..."

            $image.SaveFile($tempFile)

            Log "Imagen original guardada."

            # ------------------------------------------------
            # CONVERTIR A JPEG REAL
            # ------------------------------------------------

            Log "Convirtiendo a JPEG..."

            if (Test-Path $filePath) {

                Remove-Item $filePath -Force
            }

            $bitmap = [System.Drawing.Image]::FromFile($tempFile)

            try {

                $bitmap.Save(
                    $filePath,
                    [System.Drawing.Imaging.ImageFormat]::Jpeg
                )
            }
            finally {

                $bitmap.Dispose()
            }

            # ------------------------------------------------
            # ELIMINAR TEMPORAL
            # ------------------------------------------------

            if (Test-Path $tempFile) {

                Remove-Item $tempFile -Force
            }

            # ------------------------------------------------
            # AGREGAR ARCHIVO
            # ------------------------------------------------

            $files += $filePath

            Log "Pagina $pageNum guardada correctamente."

            Log "Archivo: $filePath"

            $pageNum++

            Log "Esperando siguiente pagina..."

        }
        catch {

            $hresult = $_.Exception.HResult
            $message = $_.Exception.Message

            Log "------------------------------------------"

            Log "Transfer() finalizado."

            Log "Mensaje: $message"

            Log "HRESULT: $hresult"

            Log "------------------------------------------"

            # ------------------------------------------------
            # FIN NORMAL DEL ADF
            # ------------------------------------------------

            if (
                $hresult -eq $WIA_ERROR_PAPER_EMPTY -or
                $hresult -eq $WIA_ERROR_ITEM_DELETED -or
                $message -match 'paper|papel|empty|vac'
            ) {

                Log "No quedan mas hojas."

                break
            }

            # ------------------------------------------------
            # CASO ESPECIAL 0x80070057
            # ------------------------------------------------
            #
            # Este es el error que te estaba dando en pagina 2.
            # NO lo tratamos inmediatamente como fin del ADF.
            #
            # Hacemos una segunda consulta al estado del feeder.
            # ------------------------------------------------

            if ($hresult -eq -2147024809) {

                Log "Se recibio 0x80070057."

                $statusProp = Get-WiaProperty `
                    $device `
                    $WIA_DPS_DOCUMENT_HANDLING_STATUS

                if (-not $statusProp) {

                    $statusProp = Get-WiaProperty `
                        $item `
                        $WIA_DPS_DOCUMENT_HANDLING_STATUS
                }

                if ($statusProp) {

                    try {

                        $status = $statusProp.Value

                        Log "Estado del alimentador: $status"

                        # Bit 0 = presencia de papel
                        if (($status -band 1) -eq 0) {

                            Log "El alimentador indica que no hay mas papel."

                            break
                        }

                        Log "El alimentador SI indica que hay papel."

                    }
                    catch {

                        Log "No se pudo leer el estado del alimentador."
                    }
                }

                # ------------------------------------------------
                # Si ya tenemos páginas y el driver dice que no
                # hay papel, terminamos.
                # ------------------------------------------------

                if ($files.Count -gt 0) {

                    Log "El driver no pudo continuar el Transfer()."

                    Log "Paginas obtenidas: $($files.Count)"

                    break
                }
            }

            # ------------------------------------------------
            # OTRO ERROR
            # ------------------------------------------------

            Log "Error real durante el escaneo."

            throw
        }
    }

    # ========================================================
    # RESULTADO
    # ========================================================

    if ($files.Count -eq 0) {

        Write-Result `
            '{"ok":false,"error":"No se obtuvo ninguna pagina del escaner."}'

        exit 0
    }

    Log "=========================================="

    Log "ESCANEO TERMINADO"

    Log "Paginas escaneadas: $($files.Count)"

    Log "=========================================="

    # ========================================================
    # JSON
    # ========================================================

    $jsonFiles = (
        $files |
        ForEach-Object {

            '"' + ($_ -replace '\\', '\\\\') + '"'
        }
    ) -join ','

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