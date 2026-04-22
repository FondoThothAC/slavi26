@echo off
title BitsoAuto Dashboard Server
echo [SISTEMA] Iniciando Servidor del Dashboard (Puerto 3001)...
cd /d "c:\Users\Eduardo\Documents\Bitso"
npx ts-node src/server.ts
pause
