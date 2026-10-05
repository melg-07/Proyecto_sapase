@echo off
title SAPASE - Puente Scan2Form
cd /d "%~dp0"

if not defined SCAN2FORM_ALLOWED_ORIGINS set "SCAN2FORM_ALLOWED_ORIGINS=http://localhost:3001,http://127.0.0.1:3001,http://172.16.32.8:3001,http://172.16.32.209:3001,https://sapase.onrender.com"

echo.
echo Iniciando Scan2Form con NAPS2...
echo Deja esta ventana abierta mientras uses el escaneo desde SAPASE.
echo Si SAPASE se abre desde otro dominio, agrega su origen a SCAN2FORM_ALLOWED_ORIGINS en este archivo.
echo.
npx --yes --package=scan2form@1.5.0 scan2form-server
set "SCAN2FORM_EXIT_CODE=%ERRORLEVEL%"

echo.
if "%SCAN2FORM_EXIT_CODE%"=="0" (
  echo Scan2Form termino.
) else (
  echo Scan2Form se cerro con el codigo %SCAN2FORM_EXIT_CODE%.
  echo Revisa el mensaje anterior y verifica Node.js y NAPS2 en PATH.
)
echo Presiona una tecla para cerrar esta ventana.
pause >nul
exit /b %SCAN2FORM_EXIT_CODE%
