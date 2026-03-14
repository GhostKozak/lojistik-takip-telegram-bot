/**
 * Fotoğraf Handler — OCR + Session Akışı (Conversations + Offline Recovery)
 * 
 * Akış:
 *   1. Fotoğraf gelir → gecikme ölçülür (offline detection)
 *   2. Açık session var mı? (gecikmeliyse mesaj zamanına göre kontrol)
 *      → Evet: fotoğrafı session'a ekle
 *      → Hayır + Gecikmeli: kapatılmış session'ı bul → yeniden aç → fotoğraf ekle
 *      → Hayır + Normal: OCR ile plaka oku → onay/düzenleme
 * 
 * Offline Recovery:
 *   Saha çalışanı çevrimdışıyken fotoğraf atar. İnternet gelince mesajlar
 *   gecikmeli ulaşır (eski timestamp ile). Bu handler gecikmeyi tespit edip
 *   fotoğrafları doğru session'a bağlar.
 */

import { getUserByTelegramId, upsertUser, addPhoto } from '../db.js';
import { recognizePlate, normalizePlate } from '../ocr.js';
import { uploadPhotoFromTelegram } from '../upload.js';
import {
    getActiveSession,
    openSession,
    resetSessionTimeout,
    incrementPhotoCount,
    getTimeoutDuration,
    getRecentClosedSession,
    reopenClosedSession,
    DELAY_THRESHOLD_MS,
} from '../session.js';
import { InlineKeyboard } from 'grammy';
import { getLang, t } from '../i18n.js';

/**
 * Buton tıklaması ile fotoğraf arasında köprü kuran kısa ömürlü Map.
 * Key: telegramId, Value: fileId
 */
const pendingFileIds = new Map();

/**
 * Mesaj gecikmesini hesapla
 * @param {import('grammy').Context} ctx
 * @returns {{ messageDate: Date, delayMs: number, isDelayed: boolean }}
 */
function measureDelay(ctx) {
    // ctx.message.date = Unix timestamp (saniye cinsinden)
    const messageDateMs = ctx.message.date * 1000;
    const messageDate = new Date(messageDateMs);
    const delayMs = Date.now() - messageDateMs;
    const isDelayed = delayMs > DELAY_THRESHOLD_MS;

    if (isDelayed) {
        const delaySec = Math.round(delayMs / 1000);
        console.log(`[OFFLINE] 📡 Gecikmeli mesaj tespit edildi: ${delaySec}s gecikme (user: ${ctx.from.id})`);
    }

    return { messageDate, delayMs, isDelayed };
}

/**
 * Fotoğraf mesajı handler'ı
 * @param {import('grammy').Context} ctx
 */
export async function handlePhoto(ctx) {
    const from = ctx.from;
    if (!from) return;

    try {
        // Kullanıcıyı kontrol et / oluştur
        let user = await getUserByTelegramId(from.id);
        if (!user) {
            user = await upsertUser({
                telegramId: from.id,
                fullName: [from.first_name, from.last_name].filter(Boolean).join(' '),
                username: from.username,
            });
        }

        // En yüksek çözünürlüklü fotoğrafı al
        const photos = ctx.message.photo;
        const bestPhoto = photos[photos.length - 1];
        const fileId = bestPhoto.file_id;

        const lang = getLang(ctx);

        // YETKİ KONTROLÜ
        if (!user.is_authorized && process.env.NODE_ENV !== 'test') {
            await ctx.reply(t(lang, 'errors', 'unauthorized') || '⛔ Bu botu kullanma yetkiniz bulunmamaktadır. Lütfen yöneticinizle iletişime geçin.');
            return;
        }

        // ---- Gecikme ölçümü ----
        const { messageDate, delayMs, isDelayed } = measureDelay(ctx);

        // ---- 1. Açık session var mı? ----
        // Gecikmeli mesajlarda mesajın gönderildiği zamana göre timeout kontrol et
        const activeSession = await getActiveSession(from.id, isDelayed ? messageDate : null);

        if (activeSession) {
            // Açık session bulundu — fotoğrafı ekle
            await addPhotoToSession(ctx, activeSession, fileId, user, lang, isDelayed);
            return;
        }

        // ---- 2. Gecikmeli mesaj + açık session yok → kapatılmış session'ı ara ----
        if (isDelayed) {
            const closedSession = await getRecentClosedSession(from.id, messageDate);

            if (closedSession) {
                // Kapatılmış session bulundu — yeniden aç ve fotoğrafı ekle
                const reopened = await reopenClosedSession(closedSession.sessionId, from.id);

                if (reopened) {
                    const delaySec = Math.round(delayMs / 1000);
                    await addPhotoToSession(ctx, reopened, fileId, user, lang, true);

                    // Kullanıcıya offline recovery bildirimi
                    await ctx.reply(
                        t(lang, 'offline', 'recoveryNotice', reopened.plateNumber, delaySec),
                        { parse_mode: 'Markdown' }
                    );
                    return;
                }
            }

            // Kapatılmış session da bulunamadı — normal OCR akışına düş
            console.log(`[OFFLINE] ⚠️ Gecikmeli mesaj için uygun session bulunamadı (user: ${from.id})`);
        }

        // ---- 3. Normal akış — OCR ile plaka oku ----
        await processNewPlatePhoto(ctx, fileId, user, lang);
    } catch (err) {
        console.error('[PHOTO] Hata:', err.message);
        await ctx.reply(t(getLang(ctx), 'photo', 'errorProcessPhoto'));
    }
}

/**
 * Açık session'a fotoğraf ekle
 * @param {boolean} [isDelayed=false] - Gecikmeli mesaj mı?
 */
async function addPhotoToSession(ctx, session, fileId, user, lang, isDelayed = false) {
    // Fotoğrafı Supabase Storage'a yükle
    let storagePath = `pending/${fileId}`;
    let publicUrl = `pending/${fileId}`;

    try {
        const uploadResult = await uploadPhotoFromTelegram({
            fileId,
            botToken: process.env.TELEGRAM_BOT_TOKEN,
            plateNumber: session.plateNumber,
            photoType: 'unknown',
        });
        storagePath = uploadResult.storagePath;
        publicUrl = uploadResult.publicUrl;
    } catch (err) {
        console.error(`[PHOTO] Upload hatası (session'a ekleme): ${err.message}`);
    }

    // Fotoğrafı DB'ye kaydet
    await addPhoto({
        sessionId: session.sessionId,
        storagePath,
        publicUrl,
        photoType: 'unknown',
        telegramFileId: fileId,
    });

    // Sayacı artır ve timeout'u sıfırla (DB'de güncellenir)
    await incrementPhotoCount(ctx.from.id);
    await resetSessionTimeout(ctx.from.id, createTimeoutCallback(ctx, lang));

    const count = session.photoCount + 1;

    await ctx.reply(
        t(lang, 'photo', 'photoAdded', count, session.plateNumber),
        { parse_mode: 'Markdown' }
    );

    const delayTag = isDelayed ? ' [OFFLINE]' : '';
    console.log(`[PHOTO] +1 → ${session.plateNumber} (toplam: ${count})${delayTag}`);
}

/**
 * Yeni plaka fotoğrafı işle (OCR)
 */
async function processNewPlatePhoto(ctx, fileId, user, lang) {
    // "İşleniyor" mesajı
    const statusMsg = await ctx.reply(t(lang, 'photo', 'processing'));

    try {
        // Fotoğrafı indir
        const file = await ctx.api.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const response = await fetch(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());

        // OCR
        const result = await recognizePlate(buffer);

        // Status mesajını sil
        try {
            await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
        } catch { /* ignore */ }

        if (result.plate) {
            // ---- OCR bir şey buldu — Butonlu doğrulama sor ----
            pendingFileIds.set(ctx.from.id, fileId);

            const keyboard = new InlineKeyboard()
                .text(t(lang, 'photo', 'btnApprove', result.plate), `plate_ok:${result.plate}`)
                .row()
                .text(t(lang, 'photo', 'btnEdit'), `plate_edit:${result.plate}`)
                .text(t(lang, 'photo', 'btnCancel'), `plate_cancel`);

            await ctx.reply(
                t(lang, 'photo', 'ocrResult', result.plate, Math.round(result.confidence * 100)),
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } else {
            // ---- OCR başarısız — doğrudan conversation başlat ----
            await ctx.conversation.enter('editPlate', {
                fileId,
                suggestedPlate: null,
            });
        }
    } catch (err) {
        console.error('[PHOTO] OCR hatası:', err.message);
        try {
            await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
        } catch { /* ignore */ }

        await ctx.reply(
            t(lang, 'photo', 'errorPhotoFail'),
            { parse_mode: 'Markdown' }
        );

        await ctx.conversation.enter('editPlate', {
            fileId,
            suggestedPlate: null,
        });
    }
}

/**
 * Callback query handler (Buton tıklamaları)
 * @param {import('grammy').Context} ctx
 */
export async function handleCallbackQuery(ctx) {
    const data = ctx.callbackQuery.data;
    const from = ctx.from;
    const lang = getLang(ctx);

    // ---- ✅ Onaylıyorum butonu ----
    if (data.startsWith('plate_ok:')) {
        const plate = data.slice('plate_ok:'.length);
        const fileId = pendingFileIds.get(from.id);

        if (!fileId) {
            await ctx.answerCallbackQuery({ text: t(lang, 'photo', 'cbTimeout'), show_alert: true });
            return;
        }

        try {
            await ctx.answerCallbackQuery();

            // Mevcut mesajı güncelle (butonları kaldır)
            await ctx.editMessageText(t(lang, 'photo', 'plateApproved', plate), { parse_mode: 'Markdown' });

            // Session aç
            const user = await getUserByTelegramId(from.id);
            const normalizedPlate = normalizePlate(plate);

            const session = await openSession({
                telegramId: from.id,
                userId: user.id,
                plateNumber: normalizedPlate,
                plateRaw: plate,
                confidence: 0.8,
                onTimeout: createTimeoutCallback(ctx, lang),
            });

            // Fotoğrafı Supabase Storage'a yükle ve kaydet
            let storagePath = `pending/${fileId}`;
            let publicUrl = `pending/${fileId}`;

            try {
                const uploadResult = await uploadPhotoFromTelegram({
                    fileId,
                    botToken: process.env.TELEGRAM_BOT_TOKEN,
                    plateNumber: normalizedPlate,
                    photoType: 'plate',
                });
                storagePath = uploadResult.storagePath;
                publicUrl = uploadResult.publicUrl;
            } catch (err) {
                console.error(`[CB] Upload hatası (onay): ${err.message}`);
            }

            await addPhoto({
                sessionId: session.sessionId,
                storagePath,
                publicUrl,
                photoType: 'plate',
                telegramFileId: fileId,
            });
            await incrementPhotoCount(from.id);

            // Geçici Map'ten temizle
            pendingFileIds.delete(from.id);

            await ctx.reply(
                t(lang, 'photo', 'sessionStarted', normalizedPlate),
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('[CB] Onay hatası:', err.message);
            await ctx.answerCallbackQuery({ text: t(lang, 'photo', 'cbError'), show_alert: true });
        }
    }
    // ---- ❌ Yanlış, Düzenle butonu → Conversation başlat ----
    else if (data.startsWith('plate_edit:')) {
        const suggestedPlate = data.slice('plate_edit:'.length);
        const fileId = pendingFileIds.get(from.id);

        if (!fileId) {
            await ctx.answerCallbackQuery({ text: t(lang, 'photo', 'cbTimeout'), show_alert: true });
            return;
        }

        try {
            await ctx.answerCallbackQuery();

            // Butonları kaldır
            await ctx.editMessageText(
                t(lang, 'photo', 'cbManualPrompt'),
                { parse_mode: 'Markdown' }
            );

            // Geçici Map'ten temizle
            pendingFileIds.delete(from.id);

            // Conversation başlat
            await ctx.conversation.enter('editPlate', {
                fileId,
                suggestedPlate,
            });
        } catch (err) {
            console.error('[CB] Düzenleme conversation hatası:', err.message);
            await ctx.answerCallbackQuery({ text: t(lang, 'photo', 'cbError'), show_alert: true });
        }
    }
    // ---- İptal butonu ----
    else if (data === 'plate_cancel') {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(t(lang, 'conversation', 'cancelled'));
    }
}

/**
 * Timeout callback factory
 */
function createTimeoutCallback(ctx, lang) {
    return async (session) => {
        try {
            await ctx.api.sendMessage(
                ctx.chat.id,
                t(lang, 'session', 'timeoutMsg', session.plateNumber, session.photoCount),
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('[SESSION] Timeout bildirim hatası:', err.message);
        }
    };
}
