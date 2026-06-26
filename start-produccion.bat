@echo off
echo ============================================
echo  KOMERCIO - Modo Produccion (MAS RAPIDO)
echo ============================================
echo.

echo Liberando puertos 3000 y 4000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " 2^>nul') do (
  taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000 " 2^>nul') do (
  taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak > nul

echo [1/3] Compilando frontend...
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 (
  echo ERROR: Fallo la compilacion del frontend.
  pause
  exit /b 1
)

echo.
echo [2/3] Iniciando Backend...
start "Komercio Backend" cmd /k "cd /d "%~dp0backend" && npm run dev"
timeout /t 3 /nobreak > nul

echo [3/3] Iniciando Frontend en modo produccion...
start "Komercio Frontend PROD" cmd /k "cd /d "%~dp0frontend" && npm start"

echo.
echo ============================================
echo  Backend:  http://localhost:4000
echo  Frontend: http://localhost:3001
echo ============================================
echo.
pause
