/**
 * /durum Komutu — Aktif session bilgisi
 */

import { getActiveSession, getTimeoutDuration } from '../session.js';

/**
 * /durum komut handler'ı
 * @param {import('grammy').Context} ctx
 */
export async function handleStatus(ctx) {
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

        const elapsed = Math.round((Date.now() - session.openedAt.getTime()) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;

        await ctx.reply(
            `📋 *Aktif Oturum Bilgisi*\n\n` +
            `🚛 Plaka: \`${session.plateNumber}\`\n` +
            `📸 Fotoğraf: ${session.photoCount} adet\n` +
            `⏱ Süre: ${minutes > 0 ? `${minutes}dk ` : ''}${seconds}sn\n` +
            `⏰ Timeout: ${getTimeoutDuration()}\n\n` +
            `📸 Fotoğraf göndermeye devam edebilirsin.\n` +
            `✅ Bitirdiğinde /done yaz.`,
            { parse_mode: 'Markdown' }
        );

        console.log(`[DURUM] ${ctx.from.first_name} → ${session.plateNumber} (${session.photoCount} fotoğraf)`);
    } catch (err) {
        console.error('[DURUM] Hata:', err.message);
        await ctx.reply('❌ Durum bilgisi alınırken hata oluştu.');
    }
}
