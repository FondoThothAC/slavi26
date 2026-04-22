# 🚀 SLAVI Trading Bot - Windows Deployment Guide

## Quick Start (3 Steps)

1. **Install Node.js** (if not installed)
   - Download from: https://nodejs.org/
   - Use LTS version (v20+)

2. **Run Installation**
   - Double-click: `install.bat`
   - Wait for dependencies to install
   - Edit `.env` with your API keys when prompted

3. **Start the Bot**
   - Double-click: `start_bot.bat`
   - Dashboard: http://localhost:3333

---

## Files Included

| File | Purpose |
|------|---------|
| `install.bat` | Auto-install dependencies |
| `start_bot.bat` | Start the trading bot |
| `setup_autorun.bat` | Configure auto-start on Windows boot |
| `.env` | API keys configuration (EDIT THIS!) |

---

## Configuration (.env file)

```
BITSO_API_KEY=your_bitso_key
BITSO_API_SECRET=your_bitso_secret
BINANCE_API_KEY=your_binance_key
BINANCE_API_SECRET=your_binance_secret
```

⚠️ **SECURITY WARNING**: Keep your `.env` file private!

---

## Auto-Run on Startup (VPS/Mini PC)

Run `setup_autorun.bat` to configure the bot to start automatically when Windows boots.

---

## Trading Strategy

- **Bitso (XRP/USD, BTC/USD)**: +0.8% target (fee ~0.65% + 0.15% profit)
- **Binance (XRP/USDT, BTC/USDT)**: +0.2% target (fee ~0.1% + 0.1% profit)

---

## Dashboard

Access: http://localhost:3333

Features:
- Real-time price monitoring
- Active strategy cycles per exchange
- Trade history and statistics
- AI sentiment analysis

---

## Support

If you encounter issues:
1. Check the console output for errors
2. Verify API keys in `.env`
3. Ensure Node.js is installed correctly
