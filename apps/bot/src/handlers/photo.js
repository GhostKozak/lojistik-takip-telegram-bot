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
import { recognizePlate } from '../ocr.js';
import {
    getActiveSession,
    openSession,
    resetSessionTimeout,
    incrementPhotoCount,
    getTimeoutDuration,
} from '../session.js';

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
    // Fotoğrafı DB'ye kaydet (Phase 5'te storage upload eklenecek)
    await addPhoto({
        sessionId: session.sessionId,
        storagePath: `pending/${fileId}`, // Phase 5'te gerçek path olacak
        publicUrl: `pending/${fileId}`,   // Phase 5'te gerçek URL olacak
        photoType: 'unknown',
        telegramFileId: fileId,
    });

    // Sayacı artır ve timeout'u sıfırla
    incrementPhotoCount(ctx.from.id);
    resetSessionTimeout(ctx.from.id, createTimeoutCallback(ctx));

    const count = session.photoCount + 1; // incrementPhotoCount henüz çağrıldı

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
        pendingManualInput.set(ctx.from.id, {
            fileId,
            timestamp: Date.now(),
            ocrResult: result,
        });

        if (result.plate) {
            // ---- OCR bir şey buldu — kullanıcıya doğrulama sor ----
            await ctx.reply(
                `🔍 *OCR Tahmini:* \`${result.plate}\`\n` +
                `📊 Güven: ${Math.round(result.confidence * 100)}%\n\n` +
                `✅ Doğruysa plakayı aynen yaz: \`${result.plate}\`\n` +
                `✏️ Yanlışsa doğru plakayı yaz (örn: \`34 ABC 1234\`)`,
                { parse_mode: 'Markdown' }
            );
        } else {
            // ---- OCR başarısız — manuel giriş iste ----
            await ctx.reply(
                `⚠️ *Plaka okunamadı*\n\n` +
                `✏️ Lütfen plaka numarasını *elle yaz*\n` +
                `Örnek: \`CB 4644 EB\` veya \`34 ABC 1234\``,
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
        const { normalizePlate } = await import('../ocr.js');
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

        // Bekleyen fotoğrafı kaydet
        await addPhoto({
            sessionId: session.sessionId,
            storagePath: `pending/${pending.fileId}`,
            publicUrl: `pending/${pending.fileId}`,
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
