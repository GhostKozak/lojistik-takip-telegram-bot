/**
 * Supabase Client & CRUD Operations
 * Veritabanı işlemleri için merkezi modül
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('❌ SUPABASE_URL ve SUPABASE_SERVICE_KEY .env dosyasında tanımlanmalı!');
}

// Singleton Supabase client (service role — bot tam yetkili)
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
});

// =============================================
// Field Users (Saha Kullanıcıları)
// =============================================

/**
 * Telegram ID'ye göre kullanıcı bul
 * @param {number} telegramId
 * @returns {Promise<object|null>}
 */
export async function getUserByTelegramId(telegramId) {
    const { data, error } = await supabase
        .from('field_users')
        .select('*')
        .eq('telegram_id', telegramId)
        .maybeSingle();

    if (error) throw new Error(`Kullanıcı sorgusu hatası: ${error.message}`);
    return data;
}

/**
 * Yeni saha kullanıcısı oluştur (veya mevcut olanı döndür)
 * @param {object} params
 * @param {number} params.telegramId
 * @param {string} params.fullName
 * @param {string} [params.username]
 * @returns {Promise<object>}
 */
export async function upsertUser({ telegramId, fullName, username }) {
    const { data, error } = await supabase
        .from('field_users')
        .upsert(
            {
                telegram_id: telegramId,
                full_name: fullName,
                username: username || null,
            },
            { onConflict: 'telegram_id' }
        )
        .select()
        .single();

    if (error) throw new Error(`Kullanıcı kayıt hatası: ${error.message}`);
    return data;
}

// =============================================
// Vehicle Sessions (Araç Oturumları)
// =============================================

/**
 * Kullanıcının açık session'ını bul
 * @param {string} userId - field_users.id (UUID)
 * @returns {Promise<object|null>}
 */
export async function getOpenSession(userId) {
    const { data, error } = await supabase
        .from('vehicle_sessions')
        .select('*, photos(*)')
        .eq('user_id', userId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .maybeSingle();

    if (error) throw new Error(`Session sorgusu hatası: ${error.message}`);
    return data;
}

/**
 * Yeni araç session'ı aç
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.plateNumber - Normalize edilmiş plaka
 * @param {string} [params.plateRaw] - OCR ham çıktısı
 * @param {number} [params.confidence] - OCR güven skoru
 * @returns {Promise<object>}
 */
export async function createSession({ userId, plateNumber, plateRaw, confidence }) {
    const { data, error } = await supabase
        .from('vehicle_sessions')
        .insert({
            user_id: userId,
            plate_number: plateNumber,
            plate_raw: plateRaw || null,
            confidence: confidence || null,
            status: 'open',
        })
        .select()
        .single();

    if (error) throw new Error(`Session oluşturma hatası: ${error.message}`);
    return data;
}

/**
 * Session'ı kapat
 * @param {string} sessionId
 * @returns {Promise<object>}
 */
export async function closeSession(sessionId) {
    const { data, error } = await supabase
        .from('vehicle_sessions')
        .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select()
        .single();

    if (error) throw new Error(`Session kapatma hatası: ${error.message}`);
    return data;
}

// =============================================
// Photos (Fotoğraflar)
// =============================================

/**
 * Fotoğraf kaydı oluştur
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string} params.storagePath
 * @param {string} params.publicUrl
 * @param {string} [params.photoType] - plate | seal | container | unknown
 * @param {string} [params.telegramFileId]
 * @param {string} [params.ocrText]
 * @returns {Promise<object>}
 */
export async function addPhoto({ sessionId, storagePath, publicUrl, photoType, telegramFileId, ocrText }) {
    const { data, error } = await supabase
        .from('photos')
        .insert({
            session_id: sessionId,
            storage_path: storagePath,
            public_url: publicUrl,
            photo_type: photoType || 'unknown',
            telegram_file_id: telegramFileId || null,
            ocr_text: ocrText || null,
        })
        .select()
        .single();

    if (error) throw new Error(`Fotoğraf kayıt hatası: ${error.message}`);
    return data;
}

/**
 * Session'a ait fotoğraf sayısını getir
 * @param {string} sessionId
 * @returns {Promise<number>}
 */
export async function getPhotoCount(sessionId) {
    const { count, error } = await supabase
        .from('photos')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId);

    if (error) throw new Error(`Fotoğraf sayı hatası: ${error.message}`);
    return count ?? 0;
}

// =============================================
// Search (Arama)
// =============================================

/**
 * Plaka numarasına göre fuzzy search
 * @param {string} query - Arama metni
 * @param {number} [limit=20]
 * @returns {Promise<object[]>}
 */
export async function searchByPlate(query, limit = 20) {
    const { data, error } = await supabase
        .from('vehicle_sessions')
        .select('*, field_users(full_name, username), photos(count)')
        .ilike('plate_number', `%${query}%`)
        .order('opened_at', { ascending: false })
        .limit(limit);

    if (error) throw new Error(`Arama hatası: ${error.message}`);
    return data;
}
