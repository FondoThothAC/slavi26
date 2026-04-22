@echo off
cd /d %~dp0
TITLE SLAVI v2.2 - Multi-Slot Trading Bot

echo ==================================================
echo 🚀 SLAVI v2.2 REFINED RIDING - PRODUCTION (Win)
echo ==================================================

echo 🧹 Releasing ports 8080 and 3334...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3334') do taskkill /f /pid %%a >nul 2>&1

REM Check if .env exists
if not exist .env (
    echo ❌ Error: .env file not found!
    echo Please create a .env file with your BINANCE_API_KEY and BINANCE_SECRET.
    pause
    exit /b 1
)

REM Check for node_modules
if not exist node_modules (
    echo 📦 node_modules not found. Installing dependencies...
    npm install
)

echo ✅ Environment Ready.
echo 🌍 Dashboard will be at: http://localhost:3334
echo 📊 Database: trades.db
echo --------------------------------------------------
echo Press Ctrl+C to stop the bot at any time.
echo.

npm run dev

pause
