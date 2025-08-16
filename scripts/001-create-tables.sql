-- Create levels table
CREATE TABLE IF NOT EXISTS levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NULL,
    close NUMERIC NULL,
    em1 NUMERIC NULL,
    upper1 NUMERIC NOT NULL,
    lower1 NUMERIC NOT NULL,
    upper2 NUMERIC NOT NULL,
    lower2 NUMERIC NOT NULL,
    source TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(symbol, valid_from)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_levels_symbol ON levels(symbol);
CREATE INDEX IF NOT EXISTS idx_levels_valid_from ON levels(valid_from);
CREATE INDEX IF NOT EXISTS idx_levels_symbol_valid_from ON levels(symbol, valid_from);

-- Create uploads table
CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blob_url TEXT NOT NULL,
    filename TEXT NOT NULL,
    filesize BIGINT,
    mime TEXT,
    ingest_summary JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on uploads
CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at DESC);
