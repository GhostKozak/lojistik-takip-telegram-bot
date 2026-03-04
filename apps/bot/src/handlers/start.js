/**
 * /start Komutu — Kullanıcı Kaydı
 * Telegram kullanıcısını veritabanına kaydeder veya günceller.
 */

import { upsertUser, getUserByTelegramId } from '../db.js';
import { getLang, t } from '../i18n.js';

/**
 * /start komut handler'ı
 * @param {import('grammy').Context} ctx
 */
export async function handleStart(ctx) {
    const from = ctx.from;
    const lang = getLang(ctx);

    if (!from) {
        await ctx.reply(t(lang, 'errors', 'noUser'));
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
            ? t(lang, 'start', 'welcomeNew', from.first_name)
            : t(lang, 'start', 'welcomeBack', from.first_name);

        await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });

        console.log(
            `[START] ${isNew ? 'Yeni kullanıcı' : 'Mevcut kullanıcı'}: ${from.first_name} (${from.id})`
        );
    } catch (err) {
        console.error('[START] Hata:', err.message);
        await ctx.reply(t(lang, 'errors', 'errorStart'));
    }
}
