@echo off
echo ============================================
echo   JPSTAGE DESIGN FSC - Iniciando Servidor (Puerto 6645)
echo ============================================
echo.

echo [jpstagedesign] Matando procesos anteriores en puertos 6645, 3244 y 3030...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :6645 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3244 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3030 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 1 /nobreak >nul

echo [jpstagedesign] Iniciando servidor en puerto 6645...
npm run dev
pause

