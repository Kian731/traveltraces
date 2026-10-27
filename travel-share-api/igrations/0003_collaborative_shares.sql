ALTER TABLE shares ADD COLUMN edit_token_hash TEXT;
ALTER TABLE shares ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shares ADD COLUMN updated_at INTEGER;

UPDATE shares
SET updated_at = created_at
WHERE updated_at IS NULL;
