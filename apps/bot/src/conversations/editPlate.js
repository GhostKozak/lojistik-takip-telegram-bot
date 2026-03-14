/**
 * Plaka Düzenleme Conversation'ı
 * 
 * grammY conversations plugin kullanarak çok adımlı plaka düzeltme akışı.
 * 
 * Akış:
 *   1. Kullanıcı "❌ Yanlış, Düzenle" butonuna basar → bu conversation başlar
 *   2. Bot: "Doğru plakayı yazınız"
 *   3. Kullanıcı plakayı metin olarak yazar
 *   4. Doğrulama + normalize → session açılır → fotoğraf kaydedilir
 * 
 * conversation.external() ile DB/API çağrıları sarmalanır (replay-safe).
 */

import { getUserByTelegramId, addPhoto } from '../db.js';
import { normalizePlate } from '../ocr.js';
import { uploadPhotoFromTelegram } from '../upload.js';
import {
    openSession,
    incrementPhotoCount,
    getTimeoutDuration,
} from '../session.js';
import { getLang, t } from '../i18n.js';

/**
 * Plaka düzenleme conversation builder
 * 
 * @param {import('@grammyjs/conversations').Conversation} conversation
 * @param {import('grammy').Context} ctx - Conversation'ı başlatan context
 * @param {object} pendingPhoto - JSON-serializable fotoğraf bilgileri
 * @param {string} pendingPhoto.fileId - Telegram file ID
 * @param {string} [pendingPhoto.suggestedPlate] - OCR'ın önerdiği plaka (varsa)
 */
export async function editPlate(conversation, ctx, pendingPhoto) {
    const lang = getLang(ctx);

    // Geçerli pending bilgisi yoksa çık
    if (!pendingPhoto || !pendingPhoto.fileId) {
        await ctx.reply(t(lang, 'photo', 'cbTimeout'));
        return;
    }

    // ---- Adım 1: Kullanıcıdan doğru plakayı iste ----
    const promptMsg = pendingPhoto.suggestedPlate
        ? t(lang, 'conversation', 'editPromptWithSuggestion', pendingPhoto.suggestedPlate)
        : t(lang, 'conversation', 'editPrompt');

    await ctx.reply(promptMsg, { parse_mode: 'Markdown' });

    // ---- Adım 2: Geçerli plaka gelene kadar bekle (max 3 deneme) ----
    let plateText = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
        // Metin mesajı bekle — fotoğraf/komut gibi başka şeyler gelirse uyar
        const response = await conversation.waitFor('message:text', {
            otherwise: (ctx) =>
                ctx.reply(t(getLang(ctx), 'conversation', 'expectText')),
        });

        const text = response.message.text.trim();

        // /iptal veya /cancel komutu — conversation'dan çık
        if (text === '/iptal' || text === '/cancel') {
            await response.reply(t(lang, 'conversation', 'cancelled'));
            return;
        }

        // Komut geldiyse conversation'ı sonlandır
        if (text.startsWith('/')) {
            await response.reply(t(lang, 'conversation', 'cancelledByCommand'));
            return;
        }

        // Minimum uzunluk kontrolü
        if (text.length < 4) {
            attempts++;
            if (attempts >= MAX_ATTEMPTS) {
                await response.reply(t(lang, 'conversation', 'tooManyAttempts'));
                return;
            }
            await response.reply(t(lang, 'photo', 'plateShort'));
            continue;
        }

        // Geçerli plaka bulundu
        plateText = text;
        break;
    }

    if (!plateText) return;

    // ---- Adım 3: Normalize et ve session aç ----
    const normalizedPlate = await conversation.external(() => normalizePlate(plateText));
    const telegramId = ctx.from.id;

    // Kullanıcıyı DB'den getir
    const user = await conversation.external(() => getUserByTelegramId(telegramId));
    if (!user) {
        await ctx.reply(t(lang, 'errors', 'noUser'));
        return;
    }

    // Session aç (race-condition korumalı)
    const session = await conversation.external(() =>
        openSession({
            telegramId,
            userId: user.id,
            plateNumber: normalizedPlate,
            plateRaw: plateText,
            confidence: 0, // Manuel giriş
        })
    );

    // ---- Adım 4: Fotoğrafı Supabase Storage'a yükle ve kaydet ----
    let storagePath = `pending/${pendingPhoto.fileId}`;
    let publicUrl = `pending/${pendingPhoto.fileId}`;

    try {
        const uploadResult = await conversation.external(() =>
            uploadPhotoFromTelegram({
                fileId: pendingPhoto.fileId,
                botToken: process.env.TELEGRAM_BOT_TOKEN,
                plateNumber: normalizedPlate,
                photoType: 'plate',
            })
        );
        storagePath = uploadResult.storagePath;
        publicUrl = uploadResult.publicUrl;
    } catch (err) {
        await conversation.log(`[CONVERSATION] Upload hatası: ${err.message}`);
    }

    await conversation.external(() =>
        addPhoto({
            sessionId: session.sessionId,
            storagePath,
            publicUrl,
            photoType: 'plate',
            telegramFileId: pendingPhoto.fileId,
        })
    );

    await conversation.external(() => incrementPhotoCount(telegramId));

    // ---- Adım 5: Başarı mesajı ----
    const timeoutStr = getTimeoutDuration(lang);

    await ctx.reply(
        t(lang, 'photo', 'plateSaved', normalizedPlate, timeoutStr),
        { parse_mode: 'Markdown' }
    );

    await conversation.log(
        `[CONVERSATION] Plaka düzenlendi: ${normalizedPlate} (user: ${telegramId})`
    );
}
