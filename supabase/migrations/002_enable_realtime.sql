-- Realtime'ı aktifleştir
-- vehicle_sessions ve photos tabloları için anlık güncellemeleri açar
ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_sessions, photos;
