-- Browser Extension Permission Risk Auditor
-- Core table: one row per scan of one extension, so scores can be compared
-- over time (Objective 5: catch a silent permission increase after an update).

CREATE TABLE IF NOT EXISTS extension_risk_history (
    id                  BIGSERIAL PRIMARY KEY,

    -- Identity, as reported by chrome.management.getAll()
    extension_id        TEXT NOT NULL,
    name                TEXT NOT NULL,
    version             TEXT,
    install_type        TEXT,              -- 'normal' | 'development' | 'sideload' | 'admin' | 'other'
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,

    -- Raw declared-permission signal (Objective 1)
    permissions         JSONB NOT NULL DEFAULT '[]',
    host_permissions    JSONB NOT NULL DEFAULT '[]',

    -- Runtime signal (Objective 3)
    observed_domains    JSONB NOT NULL DEFAULT '[]',
    unfamiliar_domains  JSONB NOT NULL DEFAULT '[]',

    -- Scoring output (Objective 2 + 4)
    permission_score    NUMERIC(5,2) NOT NULL,
    runtime_adjustment  NUMERIC(5,2) NOT NULL DEFAULT 0,
    composite_score     NUMERIC(5,2) NOT NULL,
    risk_label          TEXT NOT NULL,      -- 'Low' | 'Medium' | 'High'
    reasons             JSONB NOT NULL DEFAULT '[]',
    score_breakdown     JSONB NOT NULL DEFAULT '[]',

    checked_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erh_extension_id_checked_at
    ON extension_risk_history (extension_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_erh_composite_score
    ON extension_risk_history (composite_score DESC);

CREATE TABLE IF NOT EXISTS users (
    id                  BIGSERIAL PRIMARY KEY,
    name                TEXT NOT NULL,
    email               TEXT UNIQUE NOT NULL,
    password            TEXT NOT NULL,
    role                TEXT NOT NULL DEFAULT 'Security Analyst',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email
    ON users (email);

