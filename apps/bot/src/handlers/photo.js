/**
 * Fotoğraf Handler — OCR + Session Akışı
 * 
 * Akış:
 *   1. Fotoğraf gelir → kullanıcı DB'de var mı kontrol et
 *   2. Açık session var mı?
 *      → Evet: fotoğrafı session'a ekle (Phase 5'te storage upload)
 *      → Hayır: OCR ile plaka oku
 *        → Başarılı: yeni session aç + fotoğrafı ekle
 *        → Başarısız: kullanıcıdan plakayı elle girmesini iste
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
} from '../session.js';
import { InlineKeyboard } from 'grammy';
import { getLang, t } from '../i18n.js';

// Manuel plaka girişi bekleyen kullanıcılar
// Key: telegramId, Value: { fileId, timestamp }
const pendingManualInput = new Map();

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

        // Açık session var mı?
        const activeSession = getActiveSession(from.id);

        if (activeSession) {
            // ---- Açık session'a fotoğraf ekle ----
            await addPhotoToSession(ctx, activeSession, fileId, user, getLang(ctx));
        } else {
            // ---- OCR ile plaka oku ve yeni session aç ----
            await processNewPlatePhoto(ctx, fileId, user, getLang(ctx));
        }
    } catch (err) {
        console.error('[PHOTO] Hata:', err.message);
        await ctx.reply(t(getLang(ctx), 'photo', 'errorProcessPhoto'));
    }
}

/**
 * Açık session'a fotoğraf ekle
 */
async function addPhotoToSession(ctx, session, fileId, user, lang) {
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
        // Upload başarısız olsa da telegram_file_id ile devam et
    }

    // Fotoğrafı DB'ye kaydet
    await addPhoto({
        sessionId: session.sessionId,
        storagePath,
        publicUrl,
        photoType: 'unknown',
        telegramFileId: fileId,
    });

    // Sayacı artır ve timeout'u sıfırla
    incrementPhotoCount(ctx.from.id);
    resetSessionTimeout(ctx.from.id, createTimeoutCallback(ctx, lang));

    const count = session.photoCount + 1;

    await ctx.reply(
        t(lang, 'photo', 'photoAdded', count, session.plateNumber),
        { parse_mode: 'Markdown' }
    );

    console.log(`[PHOTO] +1 → ${session.plateNumber} (toplam: ${count})`);
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

        // Fotoğrafı pending'e kaydet (session açılınca eklenecek)
        // Buffer'ı saklıyoruz ki tekrar indirmek zorunda kalmayalım
        pendingManualInput.set(ctx.from.id, {
            fileId,
            buffer,
            timestamp: Date.now(),
            ocrResult: result,
        });

        if (result.plate) {
            // ---- OCR bir şey buldu — Butonlu doğrulama sor ----
            const keyboard = new InlineKeyboard()
                .text(t(lang, 'photo', 'btnApprove', result.plate), `plate_ok:${result.plate}`)
                .row()
                .switchInlineCurrent(t(lang, 'photo', 'btnEdit'), result.plate)
                .text(t(lang, 'photo', 'btnCancel'), `plate_manual`);

            await ctx.reply(
                t(lang, 'photo', 'ocrResult', result.plate, Math.round(result.confidence * 100)),
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } else {
            // ---- OCR başarısız — manuel giriş iste ----
            await ctx.reply(
                t(lang, 'photo', 'ocrFailed'),
                { parse_mode: 'Markdown' }
            );
        }
    } catch (err) {
        console.error('[PHOTO] OCR hatası:', err.message);
        // Status mesajını güncelle
        try {
            await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
        } catch { /* ignore */ }

        await ctx.reply(
            t(lang, 'photo', 'errorPhotoFail'),
            { parse_mode: 'Markdown' }
        );

        pendingManualInput.set(ctx.from.id, {
            fileId,
            buffer: null, // OCR hatası — buffer yok, tekrar indirilecek
            timestamp: Date.now(),
        });
    }
}

/**
 * Manuel plaka girişi handler'ı (text mesaj olarak)
 * @param {import('grammy').Context} ctx
 * @returns {boolean} İşlendi mi?
 */
export async function handleManualPlateInput(ctx) {
    const from = ctx.from;
    const lang = getLang(ctx);
    if (!from) return false;

    const pending = pendingManualInput.get(from.id);
    if (!pending) return false;

    // 10 dakikadan eski bekleme varsa temizle
    if (Date.now() - pending.timestamp > 600000) {
        pendingManualInput.delete(from.id);
        return false;
    }

    const text = ctx.message?.text?.trim();
    if (!text || text.startsWith('/')) return false;

    // Minimum uzunluk kontrolü
    if (text.length < 4) {
        await ctx.reply(t(lang, 'photo', 'plateShort'));
        return true;
    }

    try {
        // Kullanıcıyı getir
        let user = await getUserByTelegramId(from.id);
        if (!user) return false;

        // Normalize et
        const normalizedPlate = normalizePlate(text);

        // Session aç
        const session = await openSession({
            telegramId: from.id,
            userId: user.id,
            plateNumber: normalizedPlate,
            plateRaw: text,
            confidence: 0, // Manuel giriş
            onTimeout: createTimeoutCallback(ctx, lang),
        });

        // Bekleyen fotoğrafı Supabase Storage'a yükle ve kaydet
        let storagePath = `pending/${pending.fileId}`;
        let publicUrl = `pending/${pending.fileId}`;

        try {
            const uploadResult = await uploadPhotoFromTelegram({
                fileId: pending.fileId,
                botToken: process.env.TELEGRAM_BOT_TOKEN,
                plateNumber: normalizedPlate,
                photoType: 'plate',
                buffer: pending.buffer || undefined,
            });
            storagePath = uploadResult.storagePath;
            publicUrl = uploadResult.publicUrl;
        } catch (err) {
            console.error(`[PHOTO] Upload hatası (manuel): ${err.message}`);
        }

        await addPhoto({
            sessionId: session.sessionId,
            storagePath,
            publicUrl,
            photoType: 'plate',
            telegramFileId: pending.fileId,
        });
        incrementPhotoCount(from.id);

        // Pending'i temizle
        pendingManualInput.delete(from.id);

        await ctx.reply(
            t(lang, 'photo', 'plateSaved', normalizedPlate, getTimeoutDuration(lang)),
            { parse_mode: 'Markdown' }
        );

        console.log(`[PHOTO] Manuel plaka: ${normalizedPlate} (user: ${from.id})`);
        return true;
    } catch (err) {
        console.error('[PHOTO] Manuel giriş hatası:', err.message);
        await ctx.reply(t(lang, 'photo', 'errorSavePlate'));
        return true;
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

    if (data.startsWith('plate_ok:')) {
        const plate = data.split(':')[1];
        const pending = pendingManualInput.get(from.id);

        if (!pending) {
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
                confidence: pending.ocrResult?.confidence || 0.8,
                onTimeout: createTimeoutCallback(ctx, lang),
            });

            // Fotoğrafı Supabase Storage'a yükle ve kaydet
            let storagePath = `pending/${pending.fileId}`;
            let publicUrl = `pending/${pending.fileId}`;

            try {
                const uploadResult = await uploadPhotoFromTelegram({
                    fileId: pending.fileId,
                    botToken: process.env.TELEGRAM_BOT_TOKEN,
                    plateNumber: normalizedPlate,
                    photoType: 'plate',
                    buffer: pending.buffer || undefined,
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
                telegramFileId: pending.fileId,
            });
            incrementPhotoCount(from.id);

            pendingManualInput.delete(from.id);

            await ctx.reply(
                t(lang, 'photo', 'sessionStarted', normalizedPlate),
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('[CB] Onay hatası:', err.message);
            await ctx.answerCallbackQuery({ text: t(lang, 'photo', 'cbError'), show_alert: true });
        }
    }
    else if (data === 'plate_manual') {
        const pending = pendingManualInput.get(from.id);
        if (!pending) {
            await ctx.answerCallbackQuery(t(lang, 'photo', 'cbTimeout'));
            return;
        }
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(t(lang, 'photo', 'cbManualPrompt'));
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
