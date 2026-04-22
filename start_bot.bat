@echo off
chcp 65001 >nul
title SLAVI Trading Bot
echo ============================================
echo   SLAVI Trading Bot - Iniciando...
echo ============================================
echo.

:: Change to script directory
cd /d "%~dp0"
echo [INFO] Directorio: %CD%
echo.

:: Check if dependencies are installed
if not exist "node_modules" (
    echo [ERROR] La carpeta node_modules no existe.
    echo         Ejecuta install.bat primero.
    echo.
    echo Presiona cualquier tecla para salir...
    pause >nul
    exit /b 1
)

:: Check if .env exists
if not exist ".env" (
    echo [ERROR] Archivo .env no encontrado.
    echo         Ejecuta install.bat primero.
    echo.
    echo Presiona cualquier tecla para salir...
    pause >nul
    exit /b 1
)

echo [OK] Dependencias encontradas
echo [OK] Archivo .env encontrado
echo.
echo Dashboard: http://localhost:3333
echo Presiona Ctrl+C para detener el bot
echo.
echo ============================================
echo.

:: Run the bot and capture errors
call npx ts-node -r dotenv/config src/ProductionGridBot.ts 2>&1

:: If we get here, something went wrong
echo.
echo ============================================
echo [INFO] El bot se detuvo o hubo un error.
echo ============================================
echo.
echo Revisa el mensaje de arriba para ver el error.
echo.
echo Presiona cualquier tecla para cerrar...
pause >nul
