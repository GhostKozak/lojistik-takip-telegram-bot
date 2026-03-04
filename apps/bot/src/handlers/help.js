/**
 * /yardim Komutu — Kullanım Kılavuzu
 * Bot kullanım talimatlarını gösterir.
 */

import { getLang, t } from '../i18n.js';

/**
 * /yardim komut handler'ı
 * @param {import('grammy').Context} ctx
 */
export async function handleHelp(ctx) {
    const lang = getLang(ctx);
    const helpMessage = t(lang, 'help', 'text');

    await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
    console.log(`[YARDIM] ${ctx.from?.first_name} (${ctx.from?.id})`);
}
