import { TradeJournal } from '../src/telemetry/TradeJournal';

async function main() {
    console.log('--- SLAVI v2.2 Trade Analyzer ---');
    console.log('Generando reporte estadístico (Round-Robin)...\n');
    
    const journal = new TradeJournal('trades.db');
    const stats = journal.getStats();
    
    console.log(`Total Trades: ${stats.totalTrades}`);
    console.log(`Total Net Profit: ${(stats.totalNetProfit * 100).toFixed(2)}%`);
    
    // Aquí se podrían agregar queries más complejas:
    // - Profit promedio por par
    // - Duración promedio de hold
    // - Conteo por exit_reason
    
    journal.close();
    console.log('\nAnálisis completado.');
}

main().catch(console.error);
