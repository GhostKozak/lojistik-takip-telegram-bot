/**
 * /done Komutu — Aktif session'ı kapat
 */

import { getActiveSession, forceCloseSession } from '../session.js';

/**
 * /done komut handler'ı
 * @param {import('grammy').Context} ctx
 */
export async function handleDone(ctx) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    try {
        const session = getActiveSession(telegramId);

        if (!session) {
            await ctx.reply(
                '📭 Aktif bir oturumun yok.\n\n' +
                '📸 Plaka fotoğrafı göndererek yeni oturum başlatabilirsin.'
            );
            return;
        }

        // Session'ı kapat
        const closed = await forceCloseSession(telegramId);

        const duration = Math.round((Date.now() - closed.openedAt.getTime()) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;

        await ctx.reply(
            `✅ *Oturum kapatıldı*\n\n` +
            `🚛 Plaka: \`${closed.plateNumber}\`\n` +
            `📸 Fotoğraf: ${closed.photoCount} adet\n` +
            `⏱ Süre: ${minutes > 0 ? `${minutes}dk ` : ''}${seconds}sn\n\n` +
            `📸 Yeni plaka fotoğrafı göndererek başka bir oturum başlatabilirsin.`,
            { parse_mode: 'Markdown' }
        );

        console.log(`[DONE] ${ctx.from.first_name} → ${closed.plateNumber} (${closed.photoCount} fotoğraf)`);
    } catch (err) {
        console.error('[DONE] Hata:', err.message);
        await ctx.reply('❌ Oturum kapatılırken hata oluştu.');
    }
}
