CREATE TABLE account_sessions (
    token_hash TEXT PRIMARY KEY,
    nonce_hash TEXT NOT NULL UNIQUE,
    account_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX idx_account_sessions_expiry ON account_sessions (expires_at);

CREATE TABLE account_archives (
    account_id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    write_id TEXT NOT NULL
);

CREATE TABLE account_archive_parts (
    account_id TEXT NOT NULL REFERENCES account_archives (account_id),
    part INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (account_id, part)
);
