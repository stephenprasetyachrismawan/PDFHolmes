-- PDFHo!mes — OpenCode Go (NON-BYOK) + audit pemakaian AI.
-- 1) Tambah nilai enum provider 'opencode_go' (penyedia tunggal sisi-server).
-- 2) Tabel ai_usage: metadata pemakaian per request (TANPA prompt / API key).

-- ALTER TYPE ... ADD VALUE aman di PG 12+ selama nilai baru tak dipakai
-- di transaksi yang sama (migrate.mjs membungkus tiap file dalam BEGIN/COMMIT).
ALTER TYPE ai_provider ADD VALUE IF NOT EXISTS 'opencode_go';

CREATE TABLE IF NOT EXISTS ai_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model        TEXT NOT NULL,
  input_length INT  NOT NULL,
  status       TEXT NOT NULL,          -- ok | error | rate_limited
  latency_ms   INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_user_idx ON ai_usage (user_id, created_at);
