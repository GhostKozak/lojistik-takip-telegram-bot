/**
 * /durum Komutu — Aktif session bilgisi
 */

import { getActiveSession, getTimeoutDuration } from '../session.js';
import { getLang, t } from '../i18n.js';

/**
 * /durum komut handler'ı
 * @param {import('grammy').Context} ctx
 */
export async function handleStatus(ctx) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const lang = getLang(ctx);

    try {
        const session = getActiveSession(telegramId);

        if (!session) {
            await ctx.reply(t(lang, 'status', 'noSession'));
            return;
        }

        const elapsed = Math.round((Date.now() - session.openedAt.getTime()) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;

        await ctx.reply(
            t(lang, 'status', 'activeSession', session.plateNumber, session.photoCount, minutes, seconds, getTimeoutDuration(lang)),
            { parse_mode: 'Markdown' }
        );

        console.log(`[DURUM] ${ctx.from.first_name} → ${session.plateNumber} (${session.photoCount} fotoğraf)`);
    } catch (err) {
        console.error('[DURUM] Hata:', err.message);
        await ctx.reply(t(lang, 'errors', 'errorStatus'));
    }
}
