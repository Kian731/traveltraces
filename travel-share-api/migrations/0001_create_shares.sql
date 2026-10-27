CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shares_expires_at
ON shares(expires_at);
