/**
 * Admin Handler — Yetkilendirme ve Yönetim İşlemleri
 */

import { setAuthorization, getUnauthorizedUsers } from '../db.js';
import { getLang, t } from '../i18n.js';
import { InlineKeyboard } from 'grammy';

/**
 * Admin kontrolü
 */
export function isAdmin(ctx) {
    const adminId = process.env.ADMIN_ID;
    return adminId && String(ctx.from?.id) === String(adminId);
}

/**
 * Yetki bekleyen kullanıcıları listele
 */
export async function handleListPending(ctx) {
    if (!isAdmin(ctx)) return;

    const lang = getLang(ctx);
    try {
        const users = await getUnauthorizedUsers();

        if (users.length === 0) {
            await ctx.reply(t(lang, 'admin', 'noPendingUsers'));
            return;
        }

        await ctx.reply(t(lang, 'admin', 'pendingUsersList'));

        for (const user of users) {
            const keyboard = new InlineKeyboard()
                .text(t(lang, 'admin', 'btnApprove'), `auth_user:${user.telegram_id}`);

            await ctx.reply(
                `👤 *${user.full_name}*\n🆔 \`${user.telegram_id}\`\n🔗 @${user.username || '-'}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        }
    } catch (err) {
        console.error('[ADMIN] Liste hatası:', err.message);
        await ctx.reply(t(lang, 'admin', 'errorAuth'));
    }
}

/**
 * Kullanıcıyı yetkilendir (Callback)
 */
export async function handleAuthCallback(ctx) {
    if (!isAdmin(ctx)) return;

    const data = ctx.callbackQuery.data;
    const telegramId = data.split(':')[1];
    const lang = getLang(ctx);

    try {
        const user = await setAuthorization(Number(telegramId), true);
        
        await ctx.answerCallbackQuery();
        
        // Mesajı güncelle
        await ctx.editMessageText(
            t(lang, 'admin', 'userAuthorized', user.full_name),
            { parse_mode: 'Markdown' }
        );

        // Kullanıcıya bildirim gönder
        await ctx.api.sendMessage(
            telegramId,
            t(lang, 'admin', 'authNotification')
        );

        console.log(`[ADMIN] Kullanıcı yetkilendirildi: ${user.full_name} (${telegramId})`);
    } catch (err) {
        console.error('[ADMIN] Yetkilendirme hatası:', err.message);
        await ctx.answerCallbackQuery({ text: t(lang, 'admin', 'errorAuth'), show_alert: true });
    }
}

/**
 * Yeni kullanıcı kaydı uyarısını Admin'e gönder
 */
export async function notifyAdminNewUser(ctxOrApi, user) {
    const adminId = process.env.ADMIN_ID;
    if (!adminId) return;

    // Hem context hem de bot.api objesini destekle
    const api = ctxOrApi.api || ctxOrApi;
    if (!api || typeof api.sendMessage !== 'function') {
        console.error('[ADMIN] Geçersiz API objesi:', typeof api);
        return;
    }

    // Admin için varsayılan dil TR
    const lang = 'tr'; 

    const keyboard = new InlineKeyboard()
        .text(t(lang, 'admin', 'btnApprove'), `auth_user:${user.telegram_id}`);

    try {
        await api.sendMessage(
            adminId,
            t(lang, 'admin', 'newUserAlert', user.full_name, user.telegram_id),
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }
        );
    } catch (err) {
        console.error('[ADMIN] Bildirim hatası:', err.message);
    }
}
