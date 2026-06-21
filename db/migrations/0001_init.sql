-- PDFHo!mes — skema awal (§9 arsitektur).
-- Aurora PostgreSQL 16 / pgvector. Idempoten sebisanya.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector

-- ---- Enums ----
DO $$ BEGIN
  CREATE TYPE ai_provider AS ENUM ('openai','anthropic','google','openai_compatible','codex');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ai_auth_type AS ENUM ('api_key','oauth_codex');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE doc_status AS ENUM
    ('uploaded','extracting','extracted','analyzing','analyzed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE field_source AS ENUM ('extracted','inferred','hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- Pengguna (disinkron dari Cognito saat login pertama) ----
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub   TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'id',
  minio_bucket  TEXT NOT NULL,
  research_interest TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Kredensial AI (TERENKRIPSI at rest, §16) ----
CREATE TABLE IF NOT EXISTS ai_credentials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      ai_provider  NOT NULL,
  auth_type     ai_auth_type NOT NULL,
  label         TEXT,
  secret_ciphertext BYTEA NOT NULL,
  secret_nonce  BYTEA NOT NULL,
  model         TEXT,
  base_url      TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_credentials_user_idx ON ai_credentials (user_id);
-- Maksimum satu default per user.
CREATE UNIQUE INDEX IF NOT EXISTS ai_credentials_one_default
  ON ai_credentials (user_id) WHERE is_default;

-- ---- Folder (nested via parent_id) ----
CREATE TABLE IF NOT EXISTS folders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES folders(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS folders_user_parent_idx ON folders (user_id, parent_id);

-- ---- Dokumen (PDF) ----
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id     UUID REFERENCES folders(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  object_key    TEXT NOT NULL,
  mime          TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes    BIGINT,
  page_count    INT,
  content_hash  TEXT,
  status        doc_status NOT NULL DEFAULT 'uploaded',
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_user_folder_idx ON documents (user_id, folder_id);

-- ---- Hasil ekstraksi mentah & terstruktur ----
CREATE TABLE IF NOT EXISTS extractions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID UNIQUE NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  full_text     TEXT,
  tei_xml       TEXT,
  sections      JSONB,
  metadata      JSONB,
  extractor_version TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Satu kali analisis (per bahasa / per model) ----
CREATE TABLE IF NOT EXISTS analyses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  language    TEXT NOT NULL,
  provider    ai_provider,
  model       TEXT,
  status      doc_status NOT NULL DEFAULT 'analyzing',
  token_usage JSONB,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analyses_document_idx ON analyses (document_id);

-- ---- Field hasil analisis (jantung produk) ----
CREATE TABLE IF NOT EXISTS analysis_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  field_key   TEXT NOT NULL,
  label       TEXT NOT NULL,
  content_md  TEXT,
  source      field_source NOT NULL DEFAULT 'inferred',
  confidence  NUMERIC(3,2),
  order_index INT NOT NULL,
  embedding   vector(1536)
);
CREATE INDEX IF NOT EXISTS analysis_sections_analysis_idx ON analysis_sections (analysis_id);
CREATE UNIQUE INDEX IF NOT EXISTS analysis_sections_unique_field
  ON analysis_sections (analysis_id, field_key);

-- Index vektor HNSW utk kemiripan antar-paper (§9). Aman walau tabel kosong.
CREATE INDEX IF NOT EXISTS analysis_sections_embedding_idx
  ON analysis_sections USING hnsw (embedding vector_cosine_ops);
