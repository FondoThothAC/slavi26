@echo off
chcp 65001 >nul
title SLAVI Trading Bot - Instalador
echo ============================================
echo   SLAVI Trading Bot - Windows Installer
echo ============================================
echo.

:: Change to script directory
cd /d "%~dp0"
echo [INFO] Directorio: %CD%
echo.

:: Check for node
echo [PASO 1/3] Verificando Node.js...
call node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js NO esta disponible.
    echo.
    echo Soluciones:
    echo   1. Instala Node.js de https://nodejs.org/
    echo   2. Asegurate de marcar "Add to PATH" durante instalacion
    echo   3. REINICIA tu computadora despues de instalar
    echo   4. Ejecuta este script de nuevo
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do echo [OK] Node.js: %%i
echo.

:: Install dependencies
echo [PASO 2/3] Instalando dependencias...
echo            (Esto puede tardar 1-2 minutos)
echo.

call npm install 2>&1

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Fallo la instalacion de dependencias
    echo         Intenta ejecutar como Administrador
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Dependencias instaladas
echo.

:: Check .env file
echo [PASO 3/3] Verificando configuracion...
if not exist ".env" (
    echo [AVISO] Archivo .env no encontrado!
    echo         Creando plantilla...
    (
        echo BITSO_API_KEY=tu_api_key_bitso
        echo BITSO_API_SECRET=tu_api_secret_bitso
        echo BINANCE_API_KEY=tu_api_key_binance
        echo BINANCE_API_SECRET=tu_api_secret_binance
    ) > .env
    echo.
    echo [IMPORTANTE] Edita .env con tus API keys!
    notepad .env
) else (
    echo [OK] Archivo .env encontrado
)

:: Create logs directory
if not exist "logs" mkdir logs

echo.
echo ============================================
echo   Instalacion Completa!
echo ============================================
echo.
echo Ahora ejecuta: start_bot.bat
echo Dashboard: http://localhost:3333
echo.
pause
