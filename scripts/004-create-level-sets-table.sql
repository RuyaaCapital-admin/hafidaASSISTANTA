-- Create level_sets table for storing trading levels
CREATE TABLE IF NOT EXISTS level_sets (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL CHECK (timeframe IN ('daily', 'weekly', 'monthly')),
  as_of_date DATE NOT NULL,
  method VARCHAR(50) DEFAULT 'expected_move',
  upper1 DECIMAL(10,4) NOT NULL,
  lower1 DECIMAL(10,4) NOT NULL,
  upper2 DECIMAL(10,4) NOT NULL,
  lower2 DECIMAL(10,4) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, timeframe, as_of_date, method)
);

-- Create snapshots table for saving named level sets
CREATE TABLE IF NOT EXISTS level_snapshots (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  snapshot_name VARCHAR(100) NOT NULL,
  note TEXT,
  timeframes TEXT[] NOT NULL, -- ['daily', 'weekly', 'monthly']
  levels_data JSONB NOT NULL, -- Store all levels data
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, snapshot_name)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_level_sets_symbol_timeframe ON level_sets(symbol, timeframe);
CREATE INDEX IF NOT EXISTS idx_level_sets_date ON level_sets(as_of_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_symbol ON level_snapshots(symbol);
