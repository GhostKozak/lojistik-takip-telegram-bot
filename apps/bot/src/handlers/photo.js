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
            await addPhotoToSession(ctx, activeSession, fileId, user);
        } else {
            // ---- OCR ile plaka oku ve yeni session aç ----
            await processNewPlatePhoto(ctx, fileId, user);
        }
    } catch (err) {
        console.error('[PHOTO] Hata:', err.message);
        await ctx.reply('❌ Fotoğraf işlenirken bir hata oluştu. Tekrar dene.');
    }
}

/**
 * Açık session'a fotoğraf ekle
 */
async function addPhotoToSession(ctx, session, fileId, user) {
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
    resetSessionTimeout(ctx.from.id, createTimeoutCallback(ctx));

    const count = session.photoCount + 1;

    await ctx.reply(
        `📸 Fotoğraf eklendi! (${count}. fotoğraf)\n` +
        `🚛 Plaka: \`${session.plateNumber}\`\n\n` +
        `📸 Göndermeye devam et veya /done ile bitir.`,
        { parse_mode: 'Markdown' }
    );

    console.log(`[PHOTO] +1 → ${session.plateNumber} (toplam: ${count})`);
}

/**
 * Yeni plaka fotoğrafı işle (OCR)
 */
async function processNewPlatePhoto(ctx, fileId, user) {
    // "İşleniyor" mesajı
    const statusMsg = await ctx.reply('🔍 Plaka okunuyor...');

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
                .text(`✅ Onayla: ${result.plate}`, `plate_ok:${result.plate}`)
                .row()
                .switchInlineCurrent(`✏️ Düzenle`, result.plate)
                .text(`❌ İptal / Kendim Yazacağım`, `plate_manual`);

            await ctx.reply(
                `🔍 *OCR Tahmini:* \`${result.plate}\`\n` +
                `📊 Güven: ${Math.round(result.confidence * 100)}%\n\n` +
                `Lütfen seçim yapın:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } else {
            // ---- OCR başarısız — manuel giriş iste ----
            await ctx.reply(
                `⚠️ *Plaka okunamadı*\n\n` +
                `✏️ Lütfen plaka numarasını *elle yaz*\n` +
                `Örnek: \`34 ABC 1234\``,
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
            '❌ Fotoğraf işlenirken hata oluştu.\n\n' +
            '✏️ Plaka numarasını elle yazabilirsin (örn: `34 ABC 1234`)',
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
        await ctx.reply('⚠️ Plaka çok kısa. Lütfen tam plaka numarasını yaz.');
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
            onTimeout: createTimeoutCallback(ctx),
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
            `✅ *Plaka kaydedildi!*\n\n` +
            `🚛 Plaka: \`${normalizedPlate}\`\n` +
            `✏️ Manuel giriş\n\n` +
            `📸 Şimdi konteyner ve mühür fotoğraflarını gönderebilirsin.\n` +
            `⏰ ${getTimeoutDuration()} içinde otomatik kapanır veya /done ile bitir.`,
            { parse_mode: 'Markdown' }
        );

        console.log(`[PHOTO] Manuel plaka: ${normalizedPlate} (user: ${from.id})`);
        return true;
    } catch (err) {
        console.error('[PHOTO] Manuel giriş hatası:', err.message);
        await ctx.reply('❌ Plaka kaydedilirken hata oluştu. Tekrar dene.');
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

    if (data.startsWith('plate_ok:')) {
        const plate = data.split(':')[1];
        const pending = pendingManualInput.get(from.id);

        if (!pending) {
            await ctx.answerCallbackQuery({ text: '⚠️ Zaman aşımı veya geçersiz işlem.', show_alert: true });
            return;
        }

        try {
            await ctx.answerCallbackQuery();

            // Mevcut mesajı güncelle (butonları kaldır)
            await ctx.editMessageText(`✅ *Plaka onaylandı:* \`${plate}\``, { parse_mode: 'Markdown' });

            // Session aç
            const user = await getUserByTelegramId(from.id);
            const normalizedPlate = normalizePlate(plate);

            const session = await openSession({
                telegramId: from.id,
                userId: user.id,
                plateNumber: normalizedPlate,
                plateRaw: plate,
                confidence: pending.ocrResult?.confidence || 0.8,
                onTimeout: createTimeoutCallback(ctx),
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
                `✅ *Oturum Başlatıldı!*\n\n` +
                `🚛 Plaka: \`${normalizedPlate}\`\n\n` +
                `📸 Şimdi diğer fotoğrafları (konteyner, mühür vb.) gönderebilirsin.`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('[CB] Onay hatası:', err.message);
            await ctx.answerCallbackQuery({ text: '❌ Bir hata oluştu.', show_alert: true });
        }
    }
    else if (data === 'plate_manual') {
        const pending = pendingManualInput.get(from.id);
        if (!pending) {
            await ctx.answerCallbackQuery('⚠️ Geçersiz işlem.');
            return;
        }
        await ctx.answerCallbackQuery();
        await ctx.editMessageText('ℹ️ Lütfen plaka numarasını aşağıya manuel olarak yazın.');
    }
}

/**
 * Timeout callback factory
 */
function createTimeoutCallback(ctx) {
    return async (session) => {
        try {
            await ctx.api.sendMessage(
                ctx.chat.id,
                `⏰ *Oturum otomatik kapandı*\n\n` +
                `🚛 Plaka: \`${session.plateNumber}\`\n` +
                `📸 Fotoğraf: ${session.photoCount} adet\n\n` +
                `📸 Yeni plaka fotoğrafı göndererek başka bir oturum başlatabilirsin.`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('[SESSION] Timeout bildirim hatası:', err.message);
        }
    };
}
