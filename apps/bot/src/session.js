/**
 * Session Yöneticisi
 * Kullanıcı başına aktif araç oturumlarını yönetir.
 * 
 * Akış:
 *   1. Kullanıcı plaka fotoğrafı gönderir → OCR → yeni session açılır
 *   2. Sonraki fotoğraflar açık session'a eklenir
 *   3. 5 dakika işlem yapılmazsa → session otomatik kapanır
 *   4. /done komutu → session manuel kapanır
 */

import { getOpenSession, createSession, closeSession, getUserByTelegramId } from './db.js';

const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS || '300000'); // 5 dakika

/**
 * Aktif session'ları tutan in-memory map
 * Key: telegramId (number)
 * Value: { sessionId, plateNumber, userId, timer, photoCount, openedAt }
 */
const activeSessions = new Map();

/**
 * Kullanıcının aktif session'ını getir (in-memory)
 * @param {number} telegramId
 * @returns {object|null}
 */
export function getActiveSession(telegramId) {
    return activeSessions.get(telegramId) || null;
}

/**
 * Yeni session aç
 * @param {object} params
 * @param {number} params.telegramId
 * @param {string} params.userId - DB user UUID
 * @param {string} params.plateNumber - Normalize edilmiş plaka
 * @param {string} [params.plateRaw] - OCR ham çıktısı
 * @param {number} [params.confidence] - OCR güven skoru
 * @param {function} [params.onTimeout] - Timeout callback
 * @returns {Promise<object>} Açılan session bilgileri
 */
export async function openSession({ telegramId, userId, plateNumber, plateRaw, confidence, onTimeout }) {
    // Önce varolan açık session'ı kapat
    const existing = activeSessions.get(telegramId);
    if (existing) {
        await forceCloseSession(telegramId);
    }

    // DB'ye yeni session oluştur
    const dbSession = await createSession({
        userId,
        plateNumber,
        plateRaw,
        confidence,
    });

    // Timeout timer başlat
    const timer = setTimeout(async () => {
        console.log(`[SESSION] ⏰ Timeout: ${plateNumber} (${telegramId})`);
        const session = activeSessions.get(telegramId);
        if (session) {
            await forceCloseSession(telegramId);
            if (onTimeout) {
                onTimeout(session);
            }
        }
    }, SESSION_TIMEOUT_MS);

    // In-memory kayıt
    const sessionInfo = {
        sessionId: dbSession.id,
        plateNumber,
        userId,
        timer,
        photoCount: 0,
        openedAt: new Date(),
    };

    activeSessions.set(telegramId, sessionInfo);

    console.log(`[SESSION] ✅ Açıldı: ${plateNumber} → ${dbSession.id} (user: ${telegramId})`);

    return sessionInfo;
}

/**
 * Session timeout'unu sıfırla (her fotoğraf eklendiğinde)
 * @param {number} telegramId
 * @param {function} [onTimeout] - Yeni timeout callback
 */
export function resetSessionTimeout(telegramId, onTimeout) {
    const session = activeSessions.get(telegramId);
    if (!session) return;

    // Eski timer'ı temizle
    clearTimeout(session.timer);

    // Yeni timer başlat
    session.timer = setTimeout(async () => {
        console.log(`[SESSION] ⏰ Timeout: ${session.plateNumber} (${telegramId})`);
        const currentSession = activeSessions.get(telegramId);
        if (currentSession) {
            await forceCloseSession(telegramId);
            if (onTimeout) {
                onTimeout(currentSession);
            }
        }
    }, SESSION_TIMEOUT_MS);
}

/**
 * Fotoğraf sayacını artır
 * @param {number} telegramId
 */
export function incrementPhotoCount(telegramId) {
    const session = activeSessions.get(telegramId);
    if (session) {
        session.photoCount++;
    }
}

/**
 * Session'ı kapat (DB + in-memory)
 * @param {number} telegramId
 * @returns {Promise<object|null>} Kapanan session bilgileri
 */
export async function forceCloseSession(telegramId) {
    const session = activeSessions.get(telegramId);
    if (!session) return null;

    // Timer'ı temizle
    clearTimeout(session.timer);

    // DB'de kapat
    try {
        await closeSession(session.sessionId);
    } catch (err) {
        console.error(`[SESSION] DB kapatma hatası: ${err.message}`);
    }

    // In-memory'den sil
    activeSessions.delete(telegramId);

    const duration = Math.round((Date.now() - session.openedAt.getTime()) / 1000);
    console.log(`[SESSION] 🔒 Kapatıldı: ${session.plateNumber} (${session.photoCount} fotoğraf, ${duration}s)`);

    return session;
}

/**
 * Bot restart recovery — DB'deki açık session'ları in-memory'ye yükle
 * @param {function} onTimeout - Timeout callback factory (telegramId => callback)
 */
export async function recoverOpenSessions(onTimeout) {
    console.log('[SESSION] 🔄 Açık session\'lar kontrol ediliyor...');

    // Service role ile tüm açık session'ları getir
    const { supabase } = await import('./db.js');
    const { data, error } = await supabase
        .from('vehicle_sessions')
        .select('*, field_users(telegram_id), photos(count)')
        .eq('status', 'open')
        .order('opened_at', { ascending: false });

    if (error) {
        console.error(`[SESSION] Recovery hatası: ${error.message}`);
        return;
    }

    if (!data || data.length === 0) {
        console.log('[SESSION] ✅ Açık session yok');
        return;
    }

    for (const session of data) {
        const telegramId = session.field_users?.telegram_id;
        if (!telegramId) continue;

        // Session'ın ne kadar süredir açık olduğunu kontrol et
        const openedAt = new Date(session.opened_at);
        const elapsed = Date.now() - openedAt.getTime();

        if (elapsed > SESSION_TIMEOUT_MS) {
            // Timeout süresini aşmış — kapat
            console.log(`[SESSION] ⏰ Expired session kapatılıyor: ${session.plate_number}`);
            try {
                await closeSession(session.id);
            } catch (err) {
                console.error(`[SESSION] Expired session kapatma hatası: ${err.message}`);
            }
            continue;
        }

        // Hala geçerli — in-memory'ye yükle
        const remainingTime = SESSION_TIMEOUT_MS - elapsed;
        const photoCount = session.photos?.[0]?.count || 0;

        const timer = setTimeout(async () => {
            console.log(`[SESSION] ⏰ Recovered timeout: ${session.plate_number}`);
            const currentSession = activeSessions.get(telegramId);
            if (currentSession) {
                await forceCloseSession(telegramId);
                if (onTimeout) {
                    onTimeout(telegramId, currentSession);
                }
            }
        }, remainingTime);

        activeSessions.set(telegramId, {
            sessionId: session.id,
            plateNumber: session.plate_number,
            userId: session.user_id,
            timer,
            photoCount,
            openedAt,
        });

        console.log(`[SESSION] ♻️ Recovered: ${session.plate_number} (${Math.round(remainingTime / 1000)}s kaldı)`);
    }

    console.log(`[SESSION] ✅ ${activeSessions.size} session yüklendi`);
}

/**
 * Timeout süresini insan-okunur formatta döndür
 * @returns {string}
 */
export function getTimeoutDuration(lang = 'tr') {
    const minutes = Math.round(SESSION_TIMEOUT_MS / 60000);
    return lang === 'en' ? `${minutes} minutes` : `${minutes} dakika`;
}

/**
 * Tüm aktif session'ları getir (debug/admin için)
 * @returns {Map}
 */
export function getAllActiveSessions() {
    return activeSessions;
}
