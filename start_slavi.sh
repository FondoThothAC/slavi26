#!/bin/bash

# Ensure we are in the script's directory
cd "$(dirname "$0")"

# --- SLAVI v2.2 Launcher for Mac/Linux ---
echo "=================================================="
echo "🚀 SLAVI v2.2 REFINED RIDING - PRODUCTION"
echo "=================================================="

# Auto-release ports if stuck from previous runs
echo "🧹 Releasing ports 8080 and 3334..."
lsof -ti:8080,3334 | xargs kill -9 2>/dev/null

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file with your BINANCE_API_KEY and BINANCE_SECRET."
    exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "✅ Environment Ready."
echo "🌍 Dashboard will be at: http://localhost:3334"
echo "📊 Database: trades.db"
echo "--------------------------------------------------"

# Run the bot in development mode (ts-node-dev)
npm run dev
