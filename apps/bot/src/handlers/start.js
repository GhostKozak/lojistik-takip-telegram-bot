/**
 * /start Komutu — Kullanıcı Kaydı
 * Telegram kullanıcısını veritabanına kaydeder veya günceller.
 */

import { upsertUser, getUserByTelegramId } from '../db.js';

/**
 * /start komut handler'ı
 * @param {import('grammy').Context} ctx
 */
export async function handleStart(ctx) {
    const from = ctx.from;

    if (!from) {
        await ctx.reply('❌ Kullanıcı bilgisi alınamadı.');
        return;
    }

    try {
        // Kullanıcıyı kaydet veya güncelle
        const user = await upsertUser({
            telegramId: from.id,
            fullName: [from.first_name, from.last_name].filter(Boolean).join(' '),
            username: from.username,
        });

        const isNew = !user.is_authorized;

        const welcomeMessage = isNew
            ? `🚛 *Hoş geldin, ${from.first_name}!*

Lojistik Fotoğraf Yönetim Sistemi'ne kaydoldun.

📸 *Nasıl Kullanılır:*
1️⃣ Araç plakasının fotoğrafını çek ve gönder
2️⃣ Bot plakayı otomatik okuyacak (OCR)
3️⃣ Ardından konteyner ve mühür fotoğraflarını gönder
4️⃣ Tüm fotoğraflar aynı araça gruplanacak
5️⃣ İşin bittiğinde /done yaz veya 5 dk bekle

ℹ️ Detaylı bilgi için /yardim yazabilirsin.`
            : `👋 *Tekrar hoş geldin, ${from.first_name}!*

Hesabın zaten aktif. Fotoğraf göndermeye başlayabilirsin.

ℹ️ Komutlar için /yardim yaz.`;

        await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });

        console.log(
            `[START] ${isNew ? 'Yeni kullanıcı' : 'Mevcut kullanıcı'}: ${from.first_name} (${from.id})`
        );
    } catch (err) {
        console.error('[START] Hata:', err.message);
        await ctx.reply('❌ Bir hata oluştu. Lütfen tekrar dene.');
    }
}
