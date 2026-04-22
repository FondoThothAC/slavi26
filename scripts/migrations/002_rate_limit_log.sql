CREATE TABLE IF NOT EXISTS rate_limit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weight_used INTEGER NOT NULL,
    max_weight INTEGER NOT NULL,
    safety_threshold INTEGER NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_timestamp ON rate_limit_log(timestamp);
