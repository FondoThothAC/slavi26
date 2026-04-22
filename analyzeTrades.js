const fs = require('fs');

try {
    const lines = fs.readFileSync('logs/trades.csv', 'utf8').trim().split('\n');
    let inventory = {};
    let cumulativeProfit = 0;
    let badTrades = [];

    console.log('--- Deep Forensic Trade Analysis ---');

    for (let i = 1; i < lines.length; i++) {
        const p = lines[i].split(',');
        if (p.length < 8 || !p[2]) continue;

        const timestamp = p[0];
        const symbol = p[2];
        const isBuy = p[3] === 'BUY';
        const price = parseFloat(p[4]);
        const amount = parseFloat(p[5]);
        const total = parseFloat(p[6]);

        if (!inventory[symbol]) {
            inventory[symbol] = { buys: [], totalUnrealizedBought: 0 };
        }

        if (isBuy) {
            inventory[symbol].buys.push({ price, amount, total, idx: i });
            inventory[symbol].totalUnrealizedBought += total;
        } else {
            let soldAmount = amount;
            let costBasis = 0;

            while (soldAmount > 0.00000001 && inventory[symbol].buys.length > 0) {
                let firstBuy = inventory[symbol].buys[0];

                if (firstBuy.amount <= soldAmount + 0.00000001) {
                    costBasis += firstBuy.total;
                    soldAmount -= firstBuy.amount;
                    inventory[symbol].buys.shift(); // Remove fully matched buy
                } else {
                    const partialCost = (soldAmount / firstBuy.amount) * firstBuy.total;
                    costBasis += partialCost;
                    firstBuy.amount -= soldAmount;
                    firstBuy.total -= partialCost;
                    soldAmount = 0;
                }
            }

            // Profit is Money in (sell total) - Money out (buy cost basis) - Fees (0.1% on buy AND 0.1% on sell)
            // Actually `total` already matches exactly what Binance reported for the trade value.
            const sellFee = total * 0.001;
            const buyFee = costBasis * 0.001;
            const tradeNetProfit = total - costBasis - sellFee - buyFee;

            cumulativeProfit += tradeNetProfit;

            // Let's flag any trade that LOST money (beyond 5 cents to ignore rounding noise)
            if (tradeNetProfit < -0.05) {
                badTrades.push({ tradeId: i, symbol, price, totalSold: total, costBasis, netLoss: tradeNetProfit });
            }
        }
    }

    let lockedCapital = 0;
    let currentlyHolding = {};
    Object.keys(inventory).forEach(sym => {
        let symCost = 0;
        let symAmount = 0;
        inventory[sym].buys.forEach(b => {
            symCost += b.total;
            symAmount += b.amount;
        });
        if (symCost > 0.1) { // Ignore dust
            currentlyHolding[sym] = { amount: symAmount, costBasis: symCost };
            lockedCapital += symCost;
        }
    });

    const report = {
        cumulativeProfitNet: cumulativeProfit,
        totalLosingTrades: badTrades.length,
        lockedCapital,
        currentlyHolding,
        badTrades
    };

    fs.writeFileSync('logs/forensic_report.json', JSON.stringify(report, null, 2));
    console.log("Forensic report saved to logs/forensic_report.json");

} catch (e) {
    console.error("Analysis Failed:", e.message);
}
