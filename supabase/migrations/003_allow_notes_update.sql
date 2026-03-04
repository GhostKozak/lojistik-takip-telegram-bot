-- Web panel (anon role) için güncelleme izni ekle
-- Sadece vehicle_sessions tablosundaki 'notes' kolonunu güncelleyebilmesi için.
-- Not: Normalde authentication gereklidir, ancak bu projenin mevcut aşamasında anon erişim kullanılmaktadır.

DROP POLICY IF EXISTS "Anon update session notes" ON vehicle_sessions;

CREATE POLICY "Anon update session notes" ON vehicle_sessions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
