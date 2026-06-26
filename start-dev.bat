@echo off
echo Iniciando Komercio en modo desarrollo...

start "Komercio Backend" cmd /k "cd /d "%~dp0backend" && npm run dev"
timeout /t 3 /nobreak > nul
start "Komercio Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Backend corriendo en http://localhost:4000
echo Frontend corriendo en http://localhost:3001
echo.
