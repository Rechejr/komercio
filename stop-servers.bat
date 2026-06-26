@echo off
echo Deteniendo servidores de Komercio...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " 2^>nul') do (
  taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000 " 2^>nul') do (
  taskkill /PID %%a /F >nul 2>&1
)

echo Puertos 3000 y 4000 liberados.
timeout /t 1 /nobreak > nul
