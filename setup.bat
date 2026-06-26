@echo off
echo ================================================
echo   KOMERCIO - Setup inicial del proyecto
echo ================================================
echo.

echo [1/5] Instalando dependencias del Backend...
cd backend
npm install
if %errorlevel% neq 0 (echo ERROR: Fallo instalacion backend && pause && exit /b 1)
cd ..

echo.
echo [2/5] Instalando dependencias del Frontend...
cd frontend
npm install
if %errorlevel% neq 0 (echo ERROR: Fallo instalacion frontend && pause && exit /b 1)
cd ..

echo.
echo [3/5] Copiando archivo de configuracion...
if not exist backend\.env (
    copy backend\.env.example backend\.env
    echo IMPORTANTE: Edita backend\.env con tus credenciales de base de datos
)

echo.
echo [4/5] Iniciando base de datos con Docker...
docker compose up postgres redis -d
timeout /t 5 /nobreak > nul

echo.
echo [5/5] Ejecutando migraciones de base de datos...
cd backend
call npx prisma generate
call npx prisma db push
call npx ts-node prisma/seed.ts
cd ..

echo.
echo ================================================
echo   Setup completado exitosamente!
echo ================================================
echo.
echo Para iniciar el proyecto:
echo   Backend:  cd backend ^& npm run dev
echo   Frontend: cd frontend ^& npm run dev
echo.
echo URLs:
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:4000
echo   API Docs: http://localhost:4000/health
echo.
echo Credenciales demo:
echo   Email:    admin@komercio.app
echo   Password: Admin123!
echo.
pause
