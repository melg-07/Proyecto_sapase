$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=============================================="
Write-Host " PRUEBA MULTIPAGINA KODAK S2070"
Write-Host "=============================================="
Write-Host ""

# ==========================================================
# CONECTAR CON WIA
# ==========================================================

$manager = New-Object -ComObject WIA.DeviceManager

$deviceInfo = $null

foreach ($info in $manager.DeviceInfos) {

    try {

        $name = $info.Properties("Name").Value

        if ($name -like "*KODAK S2070*") {

            $deviceInfo = $info
            break
        }
    }
    catch {
    }
}

if (-not $deviceInfo) {

    Write-Host "ERROR: No se encontro el KODAK S2070."
    Read-Host "Presiona ENTER para salir"
    exit
}

Write-Host "Dispositivo:"
Write-Host $deviceInfo.Properties("Name").Value
Write-Host ""

# ==========================================================
# FUNCION PARA OBTENER PROPIEDAD
# ==========================================================

function Get-Prop($object, $id) {

    foreach ($p in $object.Properties) {

        if ($p.PropertyID -eq $id) {

            return $p
        }
    }

    return $null
}

# ==========================================================
# CONECTAR
# ==========================================================

Write-Host "Conectando con WIA..."

$device = $deviceInfo.Connect()

$item = $device.Items.Item(1)

Write-Host "Conexion correcta."
Write-Host ""

# ==========================================================
# ADF
# ==========================================================

Write-Host "=============================================="
Write-Host "CONFIGURANDO ADF"
Write-Host "=============================================="

# 3088 = DOCUMENT_HANDLING_SELECT
$prop3088 = Get-Prop $device 3088

if ($prop3088) {

    Write-Host "3088 antes: $($prop3088.Value)"

    try {

        # 1 = FEEDER
        $prop3088.Value = 1

        Write-Host "3088 despues: $($prop3088.Value)"

    }
    catch {

        Write-Host "No se pudo configurar 3088:"
        Write-Host $_.Exception.Message
    }
}
else {

    Write-Host "3088 no disponible."
}

# ==========================================================
# ESTADO DEL ADF
# ==========================================================

$prop3087 = Get-Prop $device 3087

if ($prop3087) {

    Write-Host "3087 estado: $($prop3087.Value)"
}

# ==========================================================
# CONFIGURAR NUMERO DE PAGINAS
# ==========================================================

Write-Host ""
Write-Host "=============================================="
Write-Host "CONFIGURANDO NUMERO DE PAGINAS"
Write-Host "=============================================="

# 6154 = WIA_IPS_PAGES
$prop6154 = Get-Prop $item 6154

if ($prop6154) {

    Write-Host "6154 antes: $($prop6154.Value)"

    try {

        # 0 = TODAS LAS PAGINAS DEL ADF
        $prop6154.Value = 0

        Write-Host "6154 despues: $($prop6154.Value)"
        Write-Host "Configurado para escanear TODAS las hojas."

    }
    catch {

        Write-Host "ERROR al configurar 6154:"
        Write-Host $_.Exception.Message

        Read-Host "Presiona ENTER para salir"
        exit
    }

}
else {

    Write-Host "ERROR: El Item no tiene la propiedad 6154."
    Read-Host "Presiona ENTER para salir"
    exit
}

# ==========================================================
# COLOR
# ==========================================================

Write-Host ""
Write-Host "=============================================="
Write-Host "CONFIGURANDO COLOR"
Write-Host "=============================================="

# 4103 = WIA_IPA_DATATYPE
$prop4103 = Get-Prop $item 4103

if ($prop4103) {

    Write-Host "4103 antes: $($prop4103.Value)"

    try {

        # 3 = RGB
        $prop4103.Value = 3

        Write-Host "4103 despues: $($prop4103.Value)"
        Write-Host "Color RGB configurado."

    }
    catch {

        Write-Host "No se pudo configurar color:"
        Write-Host $_.Exception.Message
    }
}

# ==========================================================
# RESOLUCION
# ==========================================================

$prop6147 = Get-Prop $item 6147

if ($prop6147) {

    try {

        $prop6147.Value = 300

        Write-Host "XRES: $($prop6147.Value)"

    }
    catch {
    }
}

$prop6148 = Get-Prop $item 6148

if ($prop6148) {

    try {

        $prop6148.Value = 300

        Write-Host "YRES: $($prop6148.Value)"

    }
    catch {
    }
}

# ==========================================================
# FORMATOS
# ==========================================================

Write-Host ""
Write-Host "=============================================="
Write-Host "FORMATOS DISPONIBLES"
Write-Host "=============================================="

foreach ($format in $item.Formats) {

    Write-Host " - $format"
}

# ==========================================================
# FORMATO
# ==========================================================

$format = "{B96B3CB1-0728-11D3-9D7B-0000F81EF32E}"

Write-Host ""
Write-Host "Formato seleccionado:"
Write-Host $format

# ==========================================================
# CARPETA
# ==========================================================

$output = Join-Path $PSScriptRoot "prueba-multipagina"

if (-not (Test-Path $output)) {

    New-Item `
        -ItemType Directory `
        -Path $output `
        -Force |
        Out-Null
}

Write-Host ""
Write-Host "Carpeta de salida:"
Write-Host $output

# ==========================================================
# LIMPIAR ARCHIVOS ANTERIORES
# ==========================================================

Get-ChildItem `
    $output `
    -File `
    -ErrorAction SilentlyContinue |
    Remove-Item -Force

# ==========================================================
# TRANSFER UNICO
# ==========================================================

Write-Host ""
Write-Host "=============================================="
Write-Host "INICIANDO ESCANEO MULTIPAGINA"
Write-Host "=============================================="
Write-Host ""

Write-Host "El escaner debe tener todas las hojas cargadas."
Write-Host ""
Write-Host "Ejecutando UN SOLO Transfer()..."
Write-Host ""

try {

    $image = $item.Transfer($format)

    if (-not $image) {

        throw "El escaner no devolvio ninguna imagen."
    }

    Write-Host ""
    Write-Host "Transfer() terminado correctamente."

    Write-Host "Formato recibido:"
    Write-Host $image.FormatID

    # ======================================================
    # GUARDAR RESULTADO
    # ======================================================

    $file = Join-Path `
        $output `
        "resultado-multipagina.img"

    if (Test-Path $file) {

        Remove-Item $file -Force
    }

    Write-Host ""
    Write-Host "Guardando resultado..."

    $image.SaveFile($file)

    Write-Host ""
    Write-Host "=============================================="
    Write-Host "ESCANEO TERMINADO"
    Write-Host "=============================================="

    Write-Host "Archivo:"
    Write-Host $file

    Write-Host ""
    Write-Host "IMPORTANTE:"
    Write-Host "Revisa si el archivo contiene todas las paginas."

}
catch {

    Write-Host ""
    Write-Host "=============================================="
    Write-Host "ERROR"
    Write-Host "=============================================="

    Write-Host "Mensaje:"
    Write-Host $_.Exception.Message

    Write-Host ""
    Write-Host "HRESULT:"
    Write-Host $_.Exception.HResult
}

Write-Host ""
Read-Host "Presiona ENTER para salir"