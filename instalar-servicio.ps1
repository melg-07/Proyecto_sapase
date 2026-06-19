#Requires -RunAsAdministrator
# ============================================================
#  SAPASE – Instalador / Desinstalador de Servicio de Windows
#
#  Uso:
#    .\instalar-servicio.ps1           -> instala o reinstala
#    .\instalar-servicio.ps1 -Desinstalar -> elimina el servicio
#
#  Requisitos previos (una sola vez):
#    1. Node.js LTS instalado (https://nodejs.org)
#    2. MySQL corriendo como servicio de Windows
#    3. nssm.exe copiado a  .\tools\nssm.exe
#       (descarga: https://nssm.cc/download -> extrae la carpeta win64)
# ============================================================
param(
    [switch]$Desinstalar
)

$ErrorActionPreference = "Stop"

$ServiceName  = "SAPASE"
$DisplayName  = "SAPASE - Sistema de Gestion de Demandas"
$Description  = "Backend Node.js – SAPASE, Ecatepec de Morelos 2025-2027"
$ProjectRoot  = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendPath  = Join-Path $ProjectRoot "backend"
$ServerScript = Join-Path $BackendPath "server.js"
$LogsPath     = Join-Path $BackendPath "logs"

Write-Host ""
Write-Host "============================================"
Write-Host "  SAPASE – Configuracion de Servicio Windows"
Write-Host "============================================"
Write-Host ""

# ============================================================
# BUSCAR NODE.JS
# ============================================================
$NodeExe = $null

# 1. Intentar desde el PATH del sistema
try { $NodeExe = (Get-Command node -ErrorAction Stop).Source } catch {}

# 2. Rutas comunes de instalacion
if (-not $NodeExe) {
    $candidates = @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $NodeExe = $c; break }
    }
}

if (-not $NodeExe) {
    Write-Error @"
Node.js no encontrado en este equipo.

Instala Node.js LTS desde:  https://nodejs.org
Luego vuelve a ejecutar este script.
"@
    exit 1
}
Write-Host "  [OK] Node.js : $NodeExe"

# ============================================================
# BUSCAR NSSM
# ============================================================
$NssmExe = $null

# 1. PATH del sistema
try { $NssmExe = (Get-Command nssm -ErrorAction Stop).Source } catch {}

# 2. Carpeta tools\ del proyecto
if (-not $NssmExe) {
    $local = Join-Path $ProjectRoot "tools\nssm.exe"
    if (Test-Path $local) { $NssmExe = $local }
}

if (-not $NssmExe) {
    Write-Error @"

NSSM no encontrado.

Pasos para instalarlo:
  1. Abre:  https://nssm.cc/download
  2. Descarga la version mas reciente (ZIP)
  3. Dentro del ZIP ve a la carpeta:  win64\
  4. Copia  nssm.exe  a la carpeta:
       $ProjectRoot\tools\nssm.exe
  5. Vuelve a ejecutar este script.

"@
    exit 1
}
Write-Host "  [OK] NSSM    : $NssmExe"

# ============================================================
# DESINSTALAR
# ============================================================
if ($Desinstalar) {
    Write-Host ""
    Write-Host "  Desinstalando servicio '$ServiceName'..."
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        & $NssmExe stop   $ServiceName | Out-Null
        Start-Sleep -Seconds 2
        & $NssmExe remove $ServiceName confirm | Out-Null
        Write-Host "  [OK] Servicio '$ServiceName' eliminado."
    } else {
        Write-Host "  El servicio '$ServiceName' no existia."
    }
    Write-Host ""
    exit 0
}

# ============================================================
# INSTALAR
# ============================================================

# ---- Verificar que server.js existe ----
if (-not (Test-Path $ServerScript)) {
    Write-Error "No se encontro el archivo: $ServerScript"
    exit 1
}

# ---- Crear directorio de logs ----
if (-not (Test-Path $LogsPath)) {
    New-Item -ItemType Directory -Path $LogsPath | Out-Null
    Write-Host "  [OK] Directorio de logs creado: $LogsPath"
}

# ---- Instalar dependencias npm si faltan ----
$NodeModules = Join-Path $BackendPath "node_modules"
if (-not (Test-Path $NodeModules)) {
    Write-Host ""
    Write-Host "  Instalando dependencias npm (puede tardar un momento)..."
    Push-Location $BackendPath
    & npm install --omit=dev
    Pop-Location
    Write-Host "  [OK] Dependencias instaladas."
}

# ---- Eliminar servicio anterior si existe ----
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host ""
    Write-Host "  Eliminando instalacion anterior del servicio..."
    & $NssmExe stop   $ServiceName 2>$null | Out-Null
    Start-Sleep -Seconds 2
    & $NssmExe remove $ServiceName confirm  | Out-Null
    Write-Host "  [OK] Servicio anterior eliminado."
}

# ---- Instalar el servicio ----
Write-Host ""
Write-Host "  Instalando servicio '$ServiceName'..."

& $NssmExe install $ServiceName $NodeExe $ServerScript | Out-Null

# Directorio de trabajo = backend/ (para que dotenv encuentre .env)
& $NssmExe set $ServiceName AppDirectory    $BackendPath     | Out-Null

# Metadatos del servicio
& $NssmExe set $ServiceName DisplayName     $DisplayName     | Out-Null
& $NssmExe set $ServiceName Description     $Description     | Out-Null

# Tipo de inicio: Automatico (arranca con Windows sin login)
& $NssmExe set $ServiceName Start           SERVICE_AUTO_START | Out-Null

# Reinicio automatico al fallar (espera 5 segundos entre intentos)
& $NssmExe set $ServiceName AppExit         Default Restart  | Out-Null
& $NssmExe set $ServiceName AppRestartDelay 5000             | Out-Null

# Stdout y stderr a archivos de log
& $NssmExe set $ServiceName AppStdout       (Join-Path $LogsPath "stdout.log") | Out-Null
& $NssmExe set $ServiceName AppStderr       (Join-Path $LogsPath "stderr.log") | Out-Null

# Rotacion de logs: diaria o al superar 10 MB
& $NssmExe set $ServiceName AppRotateFiles  1        | Out-Null
& $NssmExe set $ServiceName AppRotateOnline 1        | Out-Null
& $NssmExe set $ServiceName AppRotateSeconds 86400   | Out-Null
& $NssmExe set $ServiceName AppRotateBytes  10485760 | Out-Null

Write-Host "  [OK] Servicio configurado."

# ---- Iniciar el servicio ahora ----
Write-Host "  Iniciando servicio..."
& $NssmExe start $ServiceName | Out-Null
Start-Sleep -Seconds 4

# ---- Verificar que inicio correctamente ----
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$status = if ($svc) { $svc.Status } else { "No encontrado" }

Write-Host ""
if ($status -eq "Running") {
    # Obtener IP LAN
    $ip = (Get-NetIPAddress -AddressFamily IPv4 |
           Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notmatch "^169" } |
           Select-Object -First 1).IPAddress

    Write-Host "============================================"
    Write-Host "  EXITO: Servicio SAPASE en ejecucion"
    Write-Host "============================================"
    Write-Host ""
    Write-Host "  URL local :  http://localhost:3001"
    if ($ip) {
        Write-Host "  URL LAN   :  http://${ip}:3001"
    }
    Write-Host ""
    Write-Host "  Logs      :  $LogsPath"
    Write-Host ""
    Write-Host "  Comandos utiles (PowerShell como Admin):"
    Write-Host "    Iniciar   : nssm start SAPASE"
    Write-Host "    Detener   : nssm stop SAPASE"
    Write-Host "    Reiniciar : nssm restart SAPASE"
    Write-Host "    Estado    : Get-Service SAPASE"
    Write-Host "    Editar    : nssm edit SAPASE"
    Write-Host ""
    Write-Host "  Para desinstalar:"
    Write-Host "    .\instalar-servicio.ps1 -Desinstalar"
    Write-Host ""
} else {
    Write-Warning @"

El servicio quedo en estado: $status
Revisa los logs para ver el error:
  $LogsPath\stderr.log
"@
}
