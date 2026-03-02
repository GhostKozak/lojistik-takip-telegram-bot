-- Lojistik Fotoğraf Yönetim Sistemi — Initial Schema
-- Trigram extension (fuzzy search için)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================
-- Saha kullanıcıları
-- =============================================
CREATE TABLE field_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id   BIGINT UNIQUE NOT NULL,
  full_name     TEXT NOT NULL,
  username      TEXT,
  is_authorized BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- Araç kayıtları (plaka bazlı gruplama)
-- =============================================
CREATE TABLE vehicle_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES field_users(id) ON DELETE CASCADE,
  plate_number  TEXT NOT NULL,
  plate_raw     TEXT,
  confidence    REAL,
  status        TEXT DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  opened_at     TIMESTAMPTZ DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  notes         TEXT
);

-- =============================================
-- Fotoğraflar
-- =============================================
CREATE TABLE photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES vehicle_sessions(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  public_url    TEXT NOT NULL,
  photo_type    TEXT DEFAULT 'unknown'
    CHECK (photo_type IN ('plate', 'seal', 'container', 'unknown')),
  telegram_file_id TEXT,
  ocr_text      TEXT,
  uploaded_at   TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- İndeksler
-- =============================================

-- Fuzzy search (trigram) indeksi
CREATE INDEX idx_plate_trgm ON vehicle_sessions
  USING GIN (plate_number gin_trgm_ops);

-- Performans indeksleri
CREATE INDEX idx_sessions_user   ON vehicle_sessions(user_id);
CREATE INDEX idx_sessions_status ON vehicle_sessions(status);
CREATE INDEX idx_sessions_opened ON vehicle_sessions(opened_at DESC);
CREATE INDEX idx_photos_session  ON photos(session_id);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

ALTER TABLE field_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Service role (bot) her şeye erişebilir
CREATE POLICY "Service role full access" ON field_users
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON vehicle_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON photos
  FOR ALL USING (true) WITH CHECK (true);

-- Anon (web panel) sadece okuyabilir
CREATE POLICY "Anon read access" ON field_users
  FOR SELECT USING (true);

CREATE POLICY "Anon read access" ON vehicle_sessions
  FOR SELECT USING (true);

CREATE POLICY "Anon read access" ON photos
  FOR SELECT USING (true);
