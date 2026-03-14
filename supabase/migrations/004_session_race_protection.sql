-- =============================================
-- Race Condition Koruması + DB-First Session Yönetimi
-- =============================================

-- 1. Kullanıcı başına tek açık session garantisi
--    Partial unique index: aynı user_id için sadece bir tane status='open' kaydı olabilir
CREATE UNIQUE INDEX idx_one_open_session_per_user
  ON vehicle_sessions (user_id)
  WHERE status = 'open';

-- 2. Son aktivite zamanı — timeout hesaplaması için
ALTER TABLE vehicle_sessions
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT now();

-- 3. Fotoğraf sayacı — her seferinde COUNT sorgusu yapmamak için
ALTER TABLE vehicle_sessions
  ADD COLUMN IF NOT EXISTS photo_count INTEGER DEFAULT 0;

-- 4. Telegram ID'yi session tablosuna ekliyoruz
--    Bu sayede DB-first sorgularda field_users JOIN'e gerek kalmaz
ALTER TABLE vehicle_sessions
  ADD COLUMN IF NOT EXISTS telegram_id BIGINT;

-- Mevcut sessionlar için telegram_id doldur
UPDATE vehicle_sessions vs
  SET telegram_id = fu.telegram_id
  FROM field_users fu
  WHERE vs.user_id = fu.id
    AND vs.telegram_id IS NULL;

-- 5. Telegram ID'ye göre hızlı erişim
CREATE INDEX IF NOT EXISTS idx_sessions_telegram_id
  ON vehicle_sessions (telegram_id);

-- 6. Last activity indeksi — timeout sweep için
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity
  ON vehicle_sessions (last_activity_at)
  WHERE status = 'open';

-- 7. Fotoğraf eklendiğinde photo_count ve last_activity_at otomatik güncelle
CREATE OR REPLACE FUNCTION update_session_on_photo()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE vehicle_sessions
    SET photo_count = photo_count + 1,
        last_activity_at = now()
    WHERE id = NEW.session_id
      AND status = 'open';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: her yeni fotoğrafta çalışır
DROP TRIGGER IF EXISTS trg_update_session_on_photo ON photos;
CREATE TRIGGER trg_update_session_on_photo
  AFTER INSERT ON photos
  FOR EACH ROW
  EXECUTE FUNCTION update_session_on_photo();

-- 8. Expired session'ları kapatan fonksiyon (cron veya uygulama tarafından çağrılır)
CREATE OR REPLACE FUNCTION close_expired_sessions(timeout_ms INTEGER DEFAULT 300000)
RETURNS TABLE(
  session_id UUID,
  plate_number TEXT,
  telegram_id BIGINT,
  photo_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  UPDATE vehicle_sessions
    SET status = 'closed',
        closed_at = now()
    WHERE status = 'open'
      AND last_activity_at < now() - (timeout_ms || ' milliseconds')::INTERVAL
    RETURNING
      vehicle_sessions.id AS session_id,
      vehicle_sessions.plate_number,
      vehicle_sessions.telegram_id,
      vehicle_sessions.photo_count;
END;
$$ LANGUAGE plpgsql;
