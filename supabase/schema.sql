-- ARKX Motion Pro V2 — Supabase Schema
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query → Paste → Run

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT DEFAULT 'user',
  status      TEXT DEFAULT 'pending',
  password    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_login  TIMESTAMPTZ,
  telegram_chat_id TEXT
);

-- ── API Keys ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,
  label       TEXT,
  active      BOOLEAN DEFAULT TRUE,
  added_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Key Stats ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS key_stats (
  key_id      TEXT PRIMARY KEY REFERENCES api_keys(id) ON DELETE CASCADE,
  req         INTEGER DEFAULT 0,
  ok          INTEGER DEFAULT 0,
  err         INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'active',
  dead_reason TEXT,
  dead_at     TIMESTAMPTZ,
  last_used   TIMESTAMPTZ,
  latency     JSONB DEFAULT '[]'
);

-- ── History ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  model       TEXT NOT NULL,
  prompt      TEXT,
  task_id     TEXT,
  ep_poll     TEXT,
  status      TEXT DEFAULT 'processing',
  video_url   TEXT,
  error       TEXT,
  params      JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Settings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_history_type      ON history(type);
CREATE INDEX IF NOT EXISTS idx_history_status    ON history(status);
CREATE INDEX IF NOT EXISTS idx_history_created   ON history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keys_active       ON api_keys(active);

-- ── RLS (Row Level Security) ──────────────────────────────────
ALTER TABLE users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings  ENABLE ROW LEVEL SECURITY;

-- Allow all untuk service key (backend pakai service key)
CREATE POLICY "service_all" ON users     FOR ALL USING (true);
CREATE POLICY "service_all" ON api_keys  FOR ALL USING (true);
CREATE POLICY "service_all" ON key_stats FOR ALL USING (true);
CREATE POLICY "service_all" ON history   FOR ALL USING (true);
CREATE POLICY "service_all" ON settings  FOR ALL USING (true);
