@echo off
setlocal
cd /d "%~dp0"
title SLAVI Production Suite v2.0 - [ESTABLE]

echo ============================================
echo   SLAVI Production Suite - All-In-One
echo ============================================

:: 1. Pre-flight check: Eliminar procesos fantasmas
echo [SYSTEM] Limpiando procesos previos...
taskkill /f /im node.exe >nul 2>&1

:: 2. Lanzar la Suite Completa (Bot + Dashboard Integrado)
echo.
echo [OK] Suite preparada.
echo [LOG] Lanzando src/index.ts...
echo.

:: Usamos la lógica de BNB definitiva
call npx ts-node src/index.ts

echo.
echo ============================================
echo [WARNING] El bot se ha detenido.
echo ============================================
pause
