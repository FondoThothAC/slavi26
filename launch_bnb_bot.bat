@echo off
title SLAVI BNB Bot - MODO DEBUG
color 0C

echo ==========================================
echo    SLAVI BNB Strategy Launcher (v2.0)
echo ==========================================
echo [INFO] Iniciando... NO CIERRES ESTA VENTANA.
echo.

:: Ejecuta el bot
call npm run dev

:: Esta línea es CRÍTICA: Pausa el script aquí y muestra un mensaje
echo.
echo ==========================================
echo  [SISTEMA DETENIDO]
echo  Si ves un error arriba, léelo ahora.
echo  La ventana se quedará abierta hasta que presiones una tecla.
echo ==========================================
pause
