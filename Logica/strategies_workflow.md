# Bitso Trading Strategies - User Workflow

This document outlines how to use the available trading strategies in the Bitso Trading Bot Web Interface.

## 1. Access the Interface
- Open your browser and navigate to `http://localhost:3001`.
- You will see the "Bitso Balance" dashboard showing your current funds.

## 2. Select a Strategy
The interface provides three main strategies. Choose the one that fits your goal:

### A. Maker-Maker (Liquidity Provider)
*Goal: Profit from the spread by placing both buy and sell orders.*
1. **Input**:
   - **Book**: The currency pair (e.g., `btc_mxn`).
   - **Amount**: The quantity to trade.
   - **Spread**: (Optional) The percentage difference between buy/sell prices.
2. **Action**: Click "Run Maker-Maker".
3. **Behavior**: The bot places a Buy order slightly below market price and a Sell order slightly above. As orders fill, it cancels and reposts to maintain the spread.

### B. Maker-Taker (Aggressive Entry)
*Goal: Buy quickly at market price (Taker) and sell for a profit (Maker).*
1. **Input**:
   - **Book**: The currency pair (e.g., `eth_mxn`).
   - **Amount**: Quantity to buy.
2. **Action**: Click "Run Maker-Taker".
3. **Behavior**: The bot immediately buys the specified amount (taking liquidity). It then places a Sell Limit order at a designated profit percentage above the buy price.

### C. Elevador Chino (Grid Trading)
*Goal: Profit from volatility by creating a "grid" of orders.*
1. **Input**:
   - **Book**: The currency pair.
   - **Amount**: Total capital to deploy.
   - **Grid Levels**: Number of buy/sell levels (default 5).
2. **Action**: Click "Run Elevador Chino".
3. **Behavior**: The bot distributes buy orders at lower price intervals and sell orders at higher intervals. As the price moves up and down (the "elevator"), it executes trades to capture small profits at each level.

## 3. Monitoring
- **Real-time Logs**: The Web UI displays a log panel showing actions (e.g., "Placed Buy Order", "Order Filled").
- **Balance**: Watch your balance update automatically as trades execute.

## 4. Stopping
- Strategies run until completed or stopped manually via the "Stop" button required in the UI or by stopping the server (Ctrl+C).
