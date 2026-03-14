-- =============================================
-- Fotoğraf Arşivleme Altyapısı
-- 6 aydan eski + kapalı session fotoğraflarını temizleme desteği
-- =============================================

-- 1. Photos tablosuna arşiv durumu sütunu ekle
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Arşivlenmiş fotoğrafları hızlı filtreleme indeksi
CREATE INDEX IF NOT EXISTS idx_photos_archived
  ON photos (archived_at)
  WHERE archived_at IS NULL;

-- 3. Arşiv adaylarını bulan yardımcı fonksiyon
--    Kapalı session'lara ait, belirtilen süreden daha eski fotoğrafları döndürür.
--    Bu fonksiyon sadece OKUMA yapar — silme/güncelleme uygulama katmanında.
CREATE OR REPLACE FUNCTION get_archivable_photos(
  retention_days INTEGER DEFAULT 180
)
RETURNS TABLE(
  photo_id        UUID,
  session_id      UUID,
  storage_path    TEXT,
  plate_number    TEXT,
  uploaded_at     TIMESTAMPTZ,
  session_status  TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id           AS photo_id,
    p.session_id,
    p.storage_path,
    vs.plate_number,
    p.uploaded_at,
    vs.status      AS session_status
  FROM photos p
  INNER JOIN vehicle_sessions vs ON p.session_id = vs.id
  WHERE vs.status = 'closed'
    AND p.uploaded_at < now() - (retention_days || ' days')::INTERVAL
    AND p.archived_at IS NULL
    AND p.storage_path NOT LIKE 'archived:%'
  ORDER BY p.uploaded_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Fotoğrafları arşivlenmiş olarak işaretleyen fonksiyon
--    Storage silme işleminden SONRA çağrılmalıdır.
--    storage_path ve public_url'i "archived:" prefix ile günceller.
CREATE OR REPLACE FUNCTION mark_photos_archived(photo_ids UUID[])
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE photos
    SET archived_at  = now(),
        storage_path = 'archived:' || storage_path,
        public_url   = 'archived:' || public_url
    WHERE id = ANY(photo_ids)
      AND archived_at IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. (Opsiyonel) pg_cron ile otomatik raporlama
--    NOT: pg_cron sadece Supabase Pro+ planlarda mevcuttur.
--    Bu sadece arşiv adaylarını loglar — silme yapmaz.
--
-- SELECT cron.schedule(
--   'photo-archive-report',
--   '0 3 * * 0',  -- Her Pazar saat 03:00
--   $$
--     SELECT count(*) AS archivable_count
--     FROM get_archivable_photos(180);
--   $$
-- );
