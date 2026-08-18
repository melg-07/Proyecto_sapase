@echo off
title Agente de Escaneo SAPASE
cd /d "%~dp0"

if not exist "node_modules" (
  echo Instalando dependencias por primera vez, espera un momento...
  call npm install
)

echo.
echo Iniciando Agente de Escaneo SAPASE...
echo No cierres esta ventana mientras uses el escaneo desde SAPASE.
echo.
node server.js

pause
