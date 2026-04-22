import fs from 'fs';
import path from 'path';
import { AsyncTradeDB, TradeRecord } from './AsyncTradeDB';

async function migrate() {
    console.log('🚀 Starting Migration: CSV -> SQLite...');
    
    const csvPath = './logs/trades.csv';
    const db = new AsyncTradeDB();
    await db.init();

    if (!fs.existsSync(csvPath)) {
        console.log('⚠️ No CSV found at ./logs/trades.csv. Skipping migration.');
        return;
    }

    try {
        const content = fs.readFileSync(csvPath, 'utf-8');
        const lines = content.split('\n');
        
        let count = 0;
        const startTime = Date.now();

        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const rawLine = lines[i];
            if (!rawLine) continue;
            const line = rawLine.trim();
            if (!line) continue;

            const parts = line.split(',');
            if (parts.length >= 8) {
                const sideRaw = parts[3] ? parts[3].toUpperCase() : 'BUY';
                const record: TradeRecord = {
                    timestamp: parts[0] || new Date().toISOString(),
                    exchange: parts[1] || 'Binance',
                    symbol: parts[2] || 'UNKNOWN',
                    side: (sideRaw === 'SELL' ? 'SELL' : 'BUY'),
                    price: parseFloat(parts[4] || '0'),
                    amount: parseFloat(parts[5] || '0'),
                    total: parseFloat(parts[6] || '0'),
                    status: parts[7] || 'FILLED',
                    orderId: parts[8] || ''
                };

                await db.insertTrade(record);
                count++;
                
                if (count % 50 === 0) {
                    console.log(`✅ Migrated ${count} trades...`);
                }
            }
        }

        const duration = (Date.now() - startTime) / 1000;
        console.log(`🎉 MIGRATION COMPLETE!`);
        console.log(`📊 Total: ${count} trades migrated in ${duration.toFixed(2)}s`);
        
        // Rename old CSV instead of deleting
        const backupPath = `${csvPath}.bak`;
        fs.renameSync(csvPath, backupPath);
        console.log(`📦 Original CSV moved to ${backupPath}`);

    } catch (e: any) {
        console.error('❌ Migration failed:', e.message);
    } finally {
        await db.close();
    }
}

// Run if called directly
if (require.main === module) {
    migrate().catch(console.error);
}

export { migrate };
