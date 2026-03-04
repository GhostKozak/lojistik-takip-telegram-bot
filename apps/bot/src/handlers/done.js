/**
 * /done Komutu — Aktif session'ı kapat
 */

import { getActiveSession, forceCloseSession } from '../session.js';
import { getLang, t } from '../i18n.js';

/**
 * /done komut handler'ı
 * @param {import('grammy').Context} ctx
 */
export async function handleDone(ctx) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const lang = getLang(ctx);

    try {
        const session = getActiveSession(telegramId);

        if (!session) {
            await ctx.reply(t(lang, 'done', 'noSession'));
            return;
        }

        // Session'ı kapat
        const closed = await forceCloseSession(telegramId);

        const duration = Math.round((Date.now() - closed.openedAt.getTime()) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;

        await ctx.reply(
            t(lang, 'done', 'sessionClosed', closed.plateNumber, closed.photoCount, minutes, seconds),
            { parse_mode: 'Markdown' }
        );

        console.log(`[DONE] ${ctx.from.first_name} → ${closed.plateNumber} (${closed.photoCount} fotoğraf)`);
    } catch (err) {
        console.error('[DONE] Hata:', err.message);
        await ctx.reply(t(lang, 'errors', 'errorDone'));
    }
}
