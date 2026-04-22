CREATE TABLE IF NOT EXISTS trade_journal (
    trade_id TEXT PRIMARY KEY,
    pair TEXT NOT NULL,
    entry_reason TEXT NOT NULL,
    entry_price REAL NOT NULL,
    entry_time TEXT NOT NULL,
    exit_reason TEXT,
    exit_price REAL,
    exit_time TEXT,
    target_activated INTEGER NOT NULL DEFAULT 0,
    target_trigger_price REAL,
    trailing_armed INTEGER NOT NULL DEFAULT 0,
    peak_profit_pct REAL NOT NULL DEFAULT 0,
    trailing_exit_trigger_pct REAL NOT NULL,
    final_profit_pct REAL,
    fee_pct REAL NOT NULL,
    slippage_pct REAL NOT NULL DEFAULT 0,
    hold_duration_minutes REAL NOT NULL DEFAULT 0,
    market_condition TEXT NOT NULL DEFAULT 'unknown',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pair ON trade_journal(pair);
CREATE INDEX IF NOT EXISTS idx_exit_reason ON trade_journal(exit_reason);
