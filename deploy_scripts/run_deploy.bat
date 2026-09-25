@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0.."

echo ============================================
echo   FUTUREX FSC - DESPLIEGUE DUAL (FEROZO + VPS)
echo ============================================
echo.

if not exist ".env" (
    echo [ERROR] No se encontro .env
    pause
    exit /b 1
)

echo [1/4] Subiendo Frontend a Ferozo (FTP fullscreencode.com/futurex)...
node "%~dp0upload_ftp_full.js"
if %errorlevel% neq 0 (
    echo [ERROR] Fallo FTP
    pause
    exit /b %errorlevel%
)

echo.
echo [2/4] Preparando Backend para VPS...
if exist "%~dp0..\deploy_temp" rmdir /s /q "%~dp0..\deploy_temp"
mkdir "%~dp0..\deploy_temp"

xcopy /s /i /y "server.js" "%~dp0..\deploy_temp\" >nul 2>&1
xcopy /s /i /y "package.json" "%~dp0..\deploy_temp\" >nul 2>&1
xcopy /s /i /y "package-lock.json" "%~dp0..\deploy_temp\" >nul 2>&1
xcopy /s /i /y "public" "%~dp0..\deploy_temp\public\" >nul 2>&1
xcopy /s /i /y "data" "%~dp0..\deploy_temp\data\" >nul 2>&1

echo.
echo [3/4] Subiendo Backend a VPS por SCP (puerto 5752)...
powershell Compress-Archive -Path "%~dp0..\deploy_temp\*" -DestinationPath "%~dp0..\backend.zip" -Force
scp -P 5752 "%~dp0..\backend.zip" root@149.50.139.152:/root/ 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Fallo SCP al VPS
    pause
    exit /b %errorlevel%
)

echo.
echo [4/4] Reiniciando servicio en VPS...
ssh -p 5752 root@149.50.139.152 "cd /root/botonera-futurex && unzip -o ../backend.zip && rm ../backend.zip && npm install --production && pm2 restart futurex 2>/dev/null || pm2 start server.js --name 'futurex' && pm2 save" 2>&1

:: Limpiar
rmdir /s /q "%~dp0..\deploy_temp" 2>nul
del "%~dp0..\backend.zip" 2>nul

echo.
echo ============================================
echo   DESPLIEGUE COMPLETO - FUTUREX PUBLICADO
echo   Frontend: https://fullscreencode.com/futurex/
echo   VPS API:  https://vps-4455523-x.dattaweb.com/futurex/
echo ============================================
echo.
echo IMPORTANTE: Hacer Ctrl+Shift+R para forzar refresh del navegador
echo ============================================
pause
