/**
 * Session Yöneticisi — Supabase-First (DB-Backed)
 * 
 * ❌ Eski: activeSessions = new Map() — RAM'de tutulan state
 * ✅ Yeni: Tüm state Supabase vehicle_sessions tablosunda
 * 
 * Avantajlar:
 *   - Bot çökse bile session korunur (persistent state)
 *   - Birden fazla bot instance çalışabilir (horizontal scaling)
 *   - Race condition koruması → partial unique index (user_id, status='open')
 *   - Fotoğraf sayacı → trigger ile otomatik artırılır
 * 
 * Akış:
 *   1. Kullanıcı plaka fotoğrafı gönderir → OCR → yeni session açılır (DB INSERT)
 *   2. Sonraki fotoğraflar açık session'a eklenir (DB'den kontrol edilir)
 *   3. Periyodik sweep expired session'ları kapatır
 *   4. /done komutu → session DB'de kapatılır
 */

import { supabase, getOpenSession, createSession, closeSession, getUserByTelegramId, getPhotoCount } from './db.js';

const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS || '300000'); // 5 dakika
const SWEEP_INTERVAL_MS = parseInt(process.env.SWEEP_INTERVAL_MS || '60000');   // 1 dakika

// Offline mesaj algılama eşiği — bu değerden fazla gecikme = offline mesaj
export const DELAY_THRESHOLD_MS = parseInt(process.env.DELAY_THRESHOLD_MS || '30000'); // 30 saniye

// Sweep timer referansı (graceful shutdown için)
let sweepTimer = null;

// =============================================
// Timeout bildirimleri için callback registry
// Bot instance başına bir Map — bu sadece "kime bildirim gönderilecek" bilgisi
// Session state DEĞİL, sadece callback fonksiyonları
// =============================================
const timeoutCallbacks = new Map();

/**
 * Kullanıcının aktif session'ını getir (DB'den)
 * 
 * @param {number} telegramId
 * @param {Date} [referenceDate=null] - Gecikmiş mesajlarda mesajın gönderildiği zaman.
 *   Verilirse timeout kontrolü bu tarihe göre yapılır (Date.now() yerine).
 *   Bu sayede offline'dan dönen mesajlar expired session'ı gereksiz yere kapatmaz.
 * @returns {Promise<object|null>} Session bilgileri veya null
 */
export async function getActiveSession(telegramId, referenceDate = null) {
    const { data, error } = await supabase
        .from('vehicle_sessions')
        .select('*, photos(count)')
        .eq('telegram_id', telegramId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .maybeSingle();

    if (error) {
        console.error(`[SESSION] DB sorgu hatası: ${error.message}`);
        return null;
    }

    if (!data) return null;

    // Timeout kontrolü — referenceDate varsa mesajın zamanına göre kontrol et
    const lastActivity = new Date(data.last_activity_at || data.opened_at);
    const effectiveNow = referenceDate ? referenceDate.getTime() : Date.now();
    const elapsed = effectiveNow - lastActivity.getTime();

    if (elapsed > SESSION_TIMEOUT_MS) {
        if (referenceDate) {
            // Gecikmiş mesaj + session mesaj gönderildiğinde bile expired
            // Session'ı kapatma — sweep halledecek. Sadece null dön.
            return null;
        }
        // Normal akış — expired session'ı kapat
        console.log(`[SESSION] ⏰ Expired session tespit edildi: ${data.plate_number} (${telegramId})`);
        await closeSessionById(data.id);
        return null;
    }

    // Handler'ların beklediği formata dönüştür
    return {
        sessionId: data.id,
        plateNumber: data.plate_number,
        userId: data.user_id,
        photoCount: data.photo_count ?? data.photos?.[0]?.count ?? 0,
        openedAt: new Date(data.opened_at),
        lastActivityAt: lastActivity,
    };
}

/**
 * Yeni session aç (Race-condition korumalı)
 * 
 * Partial unique index sayesinde aynı kullanıcı için iki açık session olamaz.
 * Eğer INSERT çakışırsa (concurrent request), mevcut açık session döner.
 * 
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
    await forceCloseSession(telegramId);

    // DB'ye yeni session oluştur — race condition korumalı
    const { data, error } = await supabase
        .from('vehicle_sessions')
        .insert({
            user_id: userId,
            telegram_id: telegramId,
            plate_number: plateNumber,
            plate_raw: plateRaw || null,
            confidence: confidence || null,
            status: 'open',
            last_activity_at: new Date().toISOString(),
            photo_count: 0,
        })
        .select()
        .single();

    if (error) {
        // Unique constraint ihlali — aynı anda başka bir request session açmış
        if (error.code === '23505') {
            console.log(`[SESSION] ⚡ Race condition yakalandı — mevcut session kullanılıyor (${telegramId})`);
            const existing = await getActiveSession(telegramId);
            if (existing) {
                // Timeout callback'i kaydet
                if (onTimeout) {
                    timeoutCallbacks.set(telegramId, onTimeout);
                }
                return existing;
            }
        }
        throw new Error(`Session oluşturma hatası: ${error.message}`);
    }

    // Timeout callback'i kaydet
    if (onTimeout) {
        timeoutCallbacks.set(telegramId, onTimeout);
    }

    const sessionInfo = {
        sessionId: data.id,
        plateNumber: data.plate_number,
        userId: data.user_id,
        photoCount: 0,
        openedAt: new Date(data.opened_at),
        lastActivityAt: new Date(data.last_activity_at),
    };

    console.log(`[SESSION] ✅ Açıldı: ${plateNumber} → ${data.id} (user: ${telegramId})`);

    return sessionInfo;
}

/**
 * Session timeout'unu sıfırla (last_activity_at güncelle)
 * @param {number} telegramId
 * @param {function} [onTimeout] - Yeni timeout callback
 */
export async function resetSessionTimeout(telegramId, onTimeout) {
    const { error } = await supabase
        .from('vehicle_sessions')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('telegram_id', telegramId)
        .eq('status', 'open');

    if (error) {
        console.error(`[SESSION] Timeout sıfırlama hatası: ${error.message}`);
    }

    // Callback'i güncelle
    if (onTimeout) {
        timeoutCallbacks.set(telegramId, onTimeout);
    }
}

/**
 * Fotoğraf sayacını artır + last_activity_at güncelle
 * 
 * NOT: Migration'daki trigger (trg_update_session_on_photo) photos tablosuna
 * INSERT yapıldığında otomatik olarak photo_count ve last_activity_at'ı günceller.
 * Bu fonksiyon trigger'ın çalışmadığı durumlar için yedek güvenlik katmanıdır.
 * 
 * @param {number} telegramId
 */
export async function incrementPhotoCount(telegramId) {
    // Trigger zaten photo_count'u artırıyor ve last_activity_at'ı güncelliyor.
    // Bu çağrı ek güvenlik katmanı olarak last_activity_at'ı tekrar günceller.
    // Aynı zamanda trigger yoksa veya başarısız olursa fallback görevi görür.
    const { error } = await supabase
        .from('vehicle_sessions')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('telegram_id', telegramId)
        .eq('status', 'open');

    if (error) {
        console.error(`[SESSION] incrementPhotoCount hatası: ${error.message}`);
    }
}

/**
 * Session'ı kapat (DB)
 * @param {number} telegramId
 * @returns {Promise<object|null>} Kapanan session bilgileri
 */
export async function forceCloseSession(telegramId) {
    // Önce mevcut session bilgilerini al
    const { data: session, error: fetchError } = await supabase
        .from('vehicle_sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .eq('status', 'open')
        .maybeSingle();

    if (fetchError) {
        console.error(`[SESSION] Session getirme hatası: ${fetchError.message}`);
        return null;
    }

    if (!session) return null;

    // DB'de kapat
    const { error: closeError } = await supabase
        .from('vehicle_sessions')
        .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
        })
        .eq('id', session.id)
        .eq('status', 'open'); // Ek güvenlik — sadece hala açıksa kapat

    if (closeError) {
        console.error(`[SESSION] DB kapatma hatası: ${closeError.message}`);
    }

    // Callback'i temizle
    timeoutCallbacks.delete(telegramId);

    const duration = Math.round((Date.now() - new Date(session.opened_at).getTime()) / 1000);
    console.log(`[SESSION] 🔒 Kapatıldı: ${session.plate_number} (${session.photo_count} fotoğraf, ${duration}s)`);

    return {
        sessionId: session.id,
        plateNumber: session.plate_number,
        userId: session.user_id,
        photoCount: session.photo_count ?? 0,
        openedAt: new Date(session.opened_at),
        lastActivityAt: new Date(session.last_activity_at || session.opened_at),
    };
}

/**
 * Session'ı ID ile kapat (internal helper)
 * @param {string} sessionId
 */
async function closeSessionById(sessionId) {
    const { error } = await supabase
        .from('vehicle_sessions')
        .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('status', 'open');

    if (error) {
        console.error(`[SESSION] closeSessionById hatası: ${error.message}`);
    }
}

// =============================================
// Offline Recovery — Gecikmiş Mesaj Desteği
// =============================================

/**
 * Sweep tarafından kapatılmış ama mesaj gönderildiğinde hâlâ aktif olan session'ı bul.
 * 
 * Senaryo: Saha çalışanı offline'dayken 3 fotoğraf atar. İnternet gelince bu
 * mesajlar bota ulaşır ama session zaten timeout olmuştur. Bu fonksiyon
 * mesajın gönderildiği anda aktif olan session'ı bulur.
 * 
 * Arama mantığı:
 *   1. opened_at <= messageDate (session mesajdan önce açılmış)
 *   2. closed_at >= messageDate (session mesaj gönderildiğinde hâlâ açıkmış)
 *      VEYA closed_at son 2×timeout içinde (tolerance window)
 * 
 * @param {number} telegramId
 * @param {Date} messageDate - Mesajın Telegram'a gönderildiği tarih
 * @returns {Promise<object|null>} Session bilgileri veya null
 */
export async function getRecentClosedSession(telegramId, messageDate) {
    // Önce kesin eşleşme: mesaj, session açıkken gönderilmiş
    const { data, error } = await supabase
        .from('vehicle_sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .eq('status', 'closed')
        .lte('opened_at', messageDate.toISOString())  // Session mesajdan önce açılmış
        .gte('closed_at', messageDate.toISOString())   // Session mesajdan sonra kapanmış
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error(`[SESSION] getRecentClosedSession hatası: ${error.message}`);
        return null;
    }

    if (data) {
        console.log(`[SESSION] ♻️ Offline recovery — kesin eşleşme: ${data.plate_number} (closed_at: ${data.closed_at})`);
        return formatSessionData(data);
    }

    // Tolerance window: session kapandıktan sonra kısa süre içinde gönderilmiş mesajlar
    // (kullanıcı session kapanmadan hemen önce/sonra fotoğraf çekmiş olabilir)
    const graceWindowMs = SESSION_TIMEOUT_MS; // Timeout süresi kadar tolerans
    const earliestCloseDate = new Date(messageDate.getTime() - graceWindowMs).toISOString();

    const { data: graceData, error: graceError } = await supabase
        .from('vehicle_sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .eq('status', 'closed')
        .gte('closed_at', earliestCloseDate)           // Son grace window içinde kapanmış
        .lte('opened_at', messageDate.toISOString())   // Session mesajdan önce açılmış
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (graceError) {
        console.error(`[SESSION] getRecentClosedSession grace hatası: ${graceError.message}`);
        return null;
    }

    if (graceData) {
        console.log(`[SESSION] ♻️ Offline recovery — grace window: ${graceData.plate_number} (closed_at: ${graceData.closed_at})`);
        return formatSessionData(graceData);
    }

    return null;
}

/**
 * Kapatılmış session'ı yeniden aç (offline recovery için).
 * 
 * Partial unique index (idx_one_open_session_per_user) nedeniyle,
 * kullanıcının başka bir açık session'ı varsa bu işlem başarısız olabilir.
 * Bu durumda mevcut açık session döner.
 * 
 * @param {string} sessionId
 * @param {number} telegramId - Unique index çakışmasında fallback için
 * @returns {Promise<object|null>} Yeniden açılan session bilgileri
 */
export async function reopenClosedSession(sessionId, telegramId) {
    const { data, error } = await supabase
        .from('vehicle_sessions')
        .update({
            status: 'open',
            closed_at: null,
            last_activity_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('status', 'closed')  // Sadece kapalıysa aç
        .select()
        .maybeSingle();

    if (error) {
        // Unique constraint — başka bir açık session var
        if (error.code === '23505') {
            console.log(`[SESSION] ⚡ Reopen çakışması — mevcut açık session kullanılıyor (${telegramId})`);
            return await getActiveSession(telegramId);
        }
        console.error(`[SESSION] reopenClosedSession hatası: ${error.message}`);
        return null;
    }

    if (!data) return null;

    console.log(`[SESSION] 🔓 Yeniden açıldı (offline recovery): ${data.plate_number} → ${data.id}`);

    return formatSessionData(data);
}

/**
 * DB satırını handler formatına dönüştür (internal helper)
 */
function formatSessionData(data) {
    return {
        sessionId: data.id,
        plateNumber: data.plate_number,
        userId: data.user_id,
        photoCount: data.photo_count ?? 0,
        openedAt: new Date(data.opened_at),
        lastActivityAt: new Date(data.last_activity_at || data.opened_at),
    };
}

// =============================================
// Expired Session Sweep — Periyodik Temizleyici
// =============================================

/**
 * Expired session'ları tespit edip kapatır ve timeout bildirimlerini gönderir.
 * Her SWEEP_INTERVAL_MS'de bir çalışır.
 * 
 * @param {function} [globalOnTimeout] - (telegramId, session) => void
 */
async function sweepExpiredSessions(globalOnTimeout) {
    try {
        // DB fonksiyonunu çağır — expired session'ları atomik olarak kapatır
        const { data, error } = await supabase
            .rpc('close_expired_sessions', { timeout_ms: SESSION_TIMEOUT_MS });

        if (error) {
            // RPC yoksa fallback — manuel sorgu
            await sweepExpiredSessionsFallback(globalOnTimeout);
            return;
        }

        if (data && data.length > 0) {
            console.log(`[SWEEP] ⏰ ${data.length} expired session kapatıldı`);

            for (const session of data) {
                const telegramId = session.telegram_id;
                if (!telegramId) continue;

                // Callback'i çağır — bu instance'da kayıtlıysa
                const callback = timeoutCallbacks.get(telegramId);
                if (callback) {
                    try {
                        await callback({
                            sessionId: session.session_id,
                            plateNumber: session.plate_number,
                            photoCount: session.photo_count ?? 0,
                        });
                    } catch (err) {
                        console.error(`[SWEEP] Timeout callback hatası: ${err.message}`);
                    }
                    timeoutCallbacks.delete(telegramId);
                } else if (globalOnTimeout) {
                    // Global callback (recovery callback) kullan
                    try {
                        await globalOnTimeout(telegramId, {
                            sessionId: session.session_id,
                            plateNumber: session.plate_number,
                            photoCount: session.photo_count ?? 0,
                        });
                    } catch (err) {
                        console.error(`[SWEEP] Global timeout callback hatası: ${err.message}`);
                    }
                }
            }
        }
    } catch (err) {
        console.error(`[SWEEP] Hata: ${err.message}`);
    }
}

/**
 * RPC yoksa fallback sweep
 */
async function sweepExpiredSessionsFallback(globalOnTimeout) {
    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS).toISOString();

    const { data: expired, error } = await supabase
        .from('vehicle_sessions')
        .select('id, plate_number, telegram_id, photo_count')
        .eq('status', 'open')
        .lt('last_activity_at', cutoff);

    if (error) {
        console.error(`[SWEEP-FALLBACK] Sorgu hatası: ${error.message}`);
        return;
    }

    if (!expired || expired.length === 0) return;

    console.log(`[SWEEP-FALLBACK] ⏰ ${expired.length} expired session bulundu`);

    const ids = expired.map(s => s.id);
    
    // Toplu kapatma (N+1 Query sorununu önler)
    const { error: updateError } = await supabase
        .from('vehicle_sessions')
        .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
        })
        .in('id', ids)
        .eq('status', 'open');
        
    if (updateError) {
        console.error(`[SWEEP-FALLBACK] Toplu güncelleme hatası: ${updateError.message}`);
    }

    for (const session of expired) {
        const telegramId = session.telegram_id;
        if (!telegramId) continue;

        const callback = timeoutCallbacks.get(telegramId);
        const sessionInfo = {
            sessionId: session.id,
            plateNumber: session.plate_number,
            photoCount: session.photo_count ?? 0,
        };

        if (callback) {
            try { await callback(sessionInfo); } catch { /* ignore */ }
            timeoutCallbacks.delete(telegramId);
        } else if (globalOnTimeout) {
            try { await globalOnTimeout(telegramId, sessionInfo); } catch { /* ignore */ }
        }
    }
}

// =============================================
// Başlatma & Kapatma
// =============================================

/**
 * Expired session sweep'i başlat + eski açık session'ları temizle
 * @param {function} onTimeout - Timeout callback factory (telegramId, session) => void
 */
export async function recoverOpenSessions(onTimeout) {
    console.log('[SESSION] 🔄 DB-backed session yöneticisi başlatılıyor...');

    // İlk sweep — expired olanları hemen kapat
    await sweepExpiredSessions(onTimeout);

    // Hala açık olan session'ları logla
    const { data: openSessions, error } = await supabase
        .from('vehicle_sessions')
        .select('plate_number, telegram_id, photo_count, last_activity_at')
        .eq('status', 'open')
        .order('opened_at', { ascending: false });

    if (!error && openSessions && openSessions.length > 0) {
        console.log(`[SESSION] 📋 ${openSessions.length} aktif session:`);
        for (const s of openSessions) {
            const remaining = SESSION_TIMEOUT_MS - (Date.now() - new Date(s.last_activity_at).getTime());
            console.log(`  • ${s.plate_number} (${Math.round(remaining / 1000)}s kaldı)`);
        }
    } else {
        console.log('[SESSION] ✅ Açık session yok');
    }

    // Periyodik sweep başlat
    sweepTimer = setInterval(() => sweepExpiredSessions(onTimeout), SWEEP_INTERVAL_MS);
    console.log(`[SESSION] ⏱️ Sweep interval: ${SWEEP_INTERVAL_MS / 1000}s`);
    console.log('[SESSION] ✅ DB-backed session yöneticisi hazır');
}

/**
 * Sweep timer'ı durdur (graceful shutdown)
 */
export function stopSessionSweep() {
    if (sweepTimer) {
        clearInterval(sweepTimer);
        sweepTimer = null;
        console.log('[SESSION] ⏹️ Sweep durduruldu');
    }
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
 * @returns {Promise<object[]>}
 */
export async function getAllActiveSessions() {
    const { data, error } = await supabase
        .from('vehicle_sessions')
        .select('*, field_users(full_name, telegram_id)')
        .eq('status', 'open')
        .order('opened_at', { ascending: false });

    if (error) {
        console.error(`[SESSION] getAllActiveSessions hatası: ${error.message}`);
        return [];
    }
    return data || [];
}
