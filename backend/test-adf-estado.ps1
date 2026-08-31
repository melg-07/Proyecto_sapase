$ErrorActionPreference = "Stop"

# ============================================================
# KODAK S2070 - PRUEBA ADF MULTIPAGINA WIA
# ============================================================

$OutputDir = Join-Path $PSScriptRoot "prueba-multipagina"

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

# Limpiar pruebas anteriores
Get-ChildItem $OutputDir -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

# ============================================================
# CONSTANTES WIA
# ============================================================

$WIA_DPS_DOCUMENT_HANDLING_SELECT = 3088
$WIA_DPS_DOCUMENT_HANDLING_STATUS = 3087

$WIA_IPS_PAGES = 6154

$WIA_IPA_DATATYPE = 4103

$WIA_IPS_XRES = 6147
$WIA_IPS_YRES = 6148

# ============================================================
# VALORES
# ============================================================

$FEEDER = 1
$COLOR_RGB = 3

# TIFF
$FORMAT_TIFF = "{B96B3CB1-0728-11D3-9D7B-0000F81EF32E}"

# ============================================================
# FUNCION OBTENER PROPIEDAD
# ============================================================

function Get-WiaProperty($object, $id) {

    foreach ($prop in $object.Properties) {

        if ($prop.PropertyID -eq $id) {
            return $prop
        }
    }

    return $null
}

# ============================================================
# TITULO
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "      PRUEBA MULTIPAGINA ADF - KODAK S2070"
Write-Host "============================================================"
Write-Host ""

# ============================================================
# WIA DEVICE MANAGER
# ============================================================

Write-Host "Buscando KODAK S2070..."

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

if ($null -eq $deviceInfo) {

    Write-Host ""
    Write-Host "ERROR: No se encontro el KODAK S2070."
    Write-Host ""

    Read-Host "Presiona ENTER para salir"

    exit
}

Write-Host ""
Write-Host "Dispositivo encontrado:"
Write-Host $deviceInfo.Properties("Name").Value
Write-Host ""

# ============================================================
# CONECTAR
# ============================================================

Write-Host "Conectando con WIA..."

$device = $deviceInfo.Connect()

if ($null -eq $device) {

    throw "No se pudo conectar con el scanner."
}

Write-Host "Conexion correcta."
Write-Host ""

# ============================================================
# CONFIGURAR ADF EN DEVICE
# ============================================================

Write-Host "============================================================"
Write-Host "CONFIGURANDO ADF"
Write-Host "============================================================"
Write-Host ""

# IMPORTANTE:
# 3088 esta en DEVICE, no en ITEM.

$prop3088 = Get-WiaProperty $device $WIA_DPS_DOCUMENT_HANDLING_SELECT

if ($null -eq $prop3088) {

    throw "El dispositivo no expone la propiedad WIA 3088."
}

Write-Host "3088 antes: $($prop3088.Value)"

try {

    $prop3088.Value = $FEEDER

}
catch {

    throw "No se pudo activar el ADF: $($_.Exception.Message)"
}

Write-Host "3088 despues: $($prop3088.Value)"

if ($prop3088.Value -ne 1) {

    throw "El ADF no quedo seleccionado."
}

Write-Host "ADF seleccionado correctamente."
Write-Host ""

# ============================================================
# ESTADO DEL ADF
# ============================================================

$prop3087 = Get-WiaProperty $device $WIA_DPS_DOCUMENT_HANDLING_STATUS

if ($null -ne $prop3087) {

    Write-Host "3087 estado: $($prop3087.Value)"
}

Write-Host ""

# ============================================================
# OBTENER ITEM
# ============================================================

if ($device.Items.Count -lt 1) {

    throw "El scanner no tiene ningun Item WIA disponible."
}

$item = $device.Items.Item(1)

Write-Host "Item WIA obtenido correctamente."
Write-Host ""

# ============================================================
# NUMERO DE PAGINAS             
# ============================================================

Write-Host "============================================================"
Write-Host "CONFIGURANDO NUMERO DE PAGINAS"
Write-Host "============================================================"
Write-Host ""

$prop6154 = Get-WiaProperty $item $WIA_IPS_PAGES

if ($null -ne $prop6154) {

    Write-Host "6154 antes: $($prop6154.Value)"

    try {

        # 0 = todas las hojas del ADF
        $prop6154.Value = 0

    }
    catch {

        Write-Host "Aviso: no se pudo modificar 6154."
    }

    Write-Host "6154 despues: $($prop6154.Value)"

}
else {

    Write-Host "Aviso: el Item no expone 6154."
}

Write-Host ""

# ============================================================
# COLOR
# ============================================================

Write-Host "============================================================"
Write-Host "CONFIGURANDO COLOR"
Write-Host "============================================================"
Write-Host ""

$prop4103 = Get-WiaProperty $item $WIA_IPA_DATATYPE

if ($null -ne $prop4103) {

    Write-Host "4103 antes: $($prop4103.Value)"

    try {

        # 3 = RGB
        $prop4103.Value = $COLOR_RGB

    }
    catch {

        Write-Host "Aviso: no se pudo establecer color RGB."
    }

    Write-Host "4103 despues: $($prop4103.Value)"
}

# ============================================================
# RESOLUCION X
# ============================================================

$prop6147 = Get-WiaProperty $item $WIA_IPS_XRES

if ($null -ne $prop6147) {

    try {

        $prop6147.Value = 300

    }
    catch {

        Write-Host "Aviso: no se pudo establecer XRES."
    }
}

# ============================================================
# RESOLUCION Y
# ============================================================

$prop6148 = Get-WiaProperty $item $WIA_IPS_YRES

if ($null -ne $prop6148) {

    try {

        $prop6148.Value = 300

    }
    catch {
    
        Write-Host "Aviso: no se pudo establecer YRES."
    }
}

Write-Host ""
Write-Host "Color: RGB"
Write-Host "Resolucion: 300 DPI"
Write-Host ""

# ============================================================
# FORMATOS
# ============================================================

Write-Host "============================================================"
Write-Host "FORMATOS DISPONIBLES"
Write-Host "============================================================"
Write-Host ""

foreach ($fmt in $item.Formats) {

    Write-Host " - $fmt"
}

Write-Host ""
Write-Host "Formato seleccionado:"
Write-Host $FORMAT_TIFF
Write-Host ""

# ============================================================
# CARPETA
# ============================================================

Write-Host "Carpeta de salida:"
Write-Host $OutputDir
Write-Host ""

# ============================================================
# COMPROBAR PAPEL ANTES DE ESCANEAR
# ============================================================

$prop3087 = Get-WiaProperty $device $WIA_DPS_DOCUMENT_HANDLING_STATUS

if ($null -ne $prop3087) {

    Write-Host "Estado ADF antes de Transfer(): $($prop3087.Value)"
}

Write-Host ""
Write-Host "============================================================"
Write-Host "INICIANDO ESCANEO"
Write-Host "============================================================"
Write-Host ""

Write-Host "Coloca todas las hojas en el alimentador."
Write-Host ""

Read-Host "Cuando las hojas esten colocadas, presiona ENTER"

Write-Host ""
Write-Host "Comenzando..."
Write-Host ""

# ============================================================
# ARCHIVOS
# ============================================================

$files = @()

$maxPages = 100

# ============================================================
# ESCANEO
# ============================================================

for ($page = 1; $page -le $maxPages; $page++) {

    Write-Host ""
    Write-Host "------------------------------------------------------------"
    Write-Host "ESCANEANDO PAGINA $page"
    Write-Host "------------------------------------------------------------"

    try {

        # ------------------------------------------------------
        # OBTENER ESTADO ADF
        # ------------------------------------------------------

        $prop3087 = Get-WiaProperty $device $WIA_DPS_DOCUMENT_HANDLING_STATUS

        if ($null -ne $prop3087) {

            Write-Host "Estado ADF: $($prop3087.Value)"
        }

        # ------------------------------------------------------
        # TRANSFER
        # ------------------------------------------------------

        Write-Host "Ejecutando Transfer()..."

        $image = $item.Transfer($FORMAT_TIFF)

        if ($null -eq $image) {

            throw "WIA no devolvio ninguna imagen."
        }

        Write-Host "Transfer() correcto."

        Write-Host "Formato recibido:"
        Write-Host $image.FormatID

        # ------------------------------------------------------
        # ARCHIVO
        # ------------------------------------------------------

        $file = Join-Path `
            $OutputDir `
            ("pagina-{0:D3}.tif" -f $page)

        if (Test-Path $file) {

            Remove-Item $file -Force
        }

        Write-Host "Guardando:"
        Write-Host $file

        # ------------------------------------------------------
        # GUARDAR
        # ------------------------------------------------------

        $image.SaveFile($file)

        Write-Host "Pagina guardada correctamente."

        $files += $file

        Write-Host ""
        Write-Host "Total paginas obtenidas: $($files.Count)"

        # ------------------------------------------------------
        # ESTADO DESPUES DE TRANSFER   
        # ------------------------------------------------------

        $prop3087 = Get-WiaProperty $device $WIA_DPS_DOCUMENT_HANDLING_STATUS

        if ($null -ne $prop3087) {

            Write-Host "Estado ADF despues de Transfer(): $($prop3087.Value)"
        }

    }
    catch {

        $hr = $_.Exception.HResult
        $msg = $_.Exception.Message

        Write-Host ""
        Write-Host "ERROR EN TRANSFER()"
        Write-Host "------------------------------------------------------------"
        Write-Host "Mensaje:"
        Write-Host $msg
        Write-Host ""
        Write-Host "HRESULT:"
        Write-Host $hr
        Write-Host "------------------------------------------------------------"

        # ======================================================
        # NO HAY PAPEL
        # ======================================================

        if (
            $hr -eq -2145320957 -or
            $msg -match "no hay ninguno en el alimentador" -or
            $msg -match "paper" -or
            $msg -match "papel" -or
            $msg -match "empty" -or
            $msg -match "vac"
        ) {

            Write-Host ""
            Write-Host "El scanner indica que no quedan hojas."
            Write-Host "Escaneo terminado normalmente."

            break
        }

        # ======================================================
        # PARAMETRO INCORRECTO
        # ======================================================

        if ($hr -eq -2147024809) {

            Write-Host ""
            Write-Host "El driver WIA rechazo el siguiente Transfer()."
            Write-Host ""

            if ($files.Count -gt 0) {

                Write-Host "Paginas obtenidas hasta este momento:"
                Write-Host $files.Count

                break
            }
        }

        # ======================================================
        # OTRO ERROR
        # ======================================================

        Write-Host ""
        Write-Host "ERROR NO CONTROLADO."

        throw
    }
}

# ============================================================
# RESULTADO
# ============================================================

Write-Host ""
Write-Host "============================================================"
Write-Host "RESULTADO FINAL"
Write-Host "============================================================"
Write-Host ""

Write-Host "Paginas obtenidas: $($files.Count)"
Write-Host ""

if ($files.Count -eq 0) {

    Write-Host "No se obtuvo ninguna pagina."

}
else {

    foreach ($file in $files) {

        Write-Host " - $file"
    }
}

Write-Host ""
Write-Host "============================================================"
Write-Host ""

Read-Host "Presiona ENTER para salir"