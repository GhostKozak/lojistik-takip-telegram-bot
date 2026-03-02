/**
 * Lojistik Fotoğraf Yönetim Botu — Ana Giriş Noktası
 * Telegram bot instance, middleware zinciri ve komut kayıtları
 */

import 'dotenv/config';
import { Bot, GrammyError, HttpError } from 'grammy';
import { handleStart } from './handlers/start.js';
import { handleHelp } from './handlers/help.js';

// =============================================
// Bot Token Kontrolü
// =============================================
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN || BOT_TOKEN === 'your_bot_token_here') {
    console.error('╔══════════════════════════════════════════════════╗');
    console.error('║  ❌ TELEGRAM_BOT_TOKEN ayarlanmamış!              ║');
    console.error('║                                                  ║');
    console.error('║  1. @BotFather ile yeni bot oluştur              ║');
    console.error('║  2. Token\'ı .env dosyasına yapıştır              ║');
    console.error('║  3. Botu tekrar başlat                           ║');
    console.error('╚══════════════════════════════════════════════════╝');
    process.exit(1);
}

// =============================================
// Bot Instance
// =============================================
const bot = new Bot(BOT_TOKEN);

// =============================================
// Middleware — Loglama
// =============================================
bot.use(async (ctx, next) => {
    const start = Date.now();
    const user = ctx.from;
    const updateType = ctx.updateType;

    // Gelen güncellemeyi logla
    if (user) {
        console.log(
            `[${new Date().toISOString()}] ${updateType} ← ${user.first_name} (${user.id})${ctx.message?.text ? ` : "${ctx.message.text}"` : ''
            }${ctx.message?.photo ? ' : [📸 fotoğraf]' : ''}`
        );
    }

    await next();

    const duration = Date.now() - start;
    if (duration > 1000) {
        console.log(`  ⚠️  Yavaş işlem: ${duration}ms`);
    }
});

// =============================================
// Komutlar
// =============================================
bot.command('start', handleStart);
bot.command('yardim', handleHelp);
bot.command('help', handleHelp); // İngilizce alias

// =============================================
// Geçici: Fotoğraf mesajı handler (Phase 3-4'te geliştirilecek)
// =============================================
bot.on('message:photo', async (ctx) => {
    await ctx.reply(
        '📸 Fotoğrafını aldım! Ancak fotoğraf işleme henüz aktif değil.\n\n' +
        '🔜 Bu özellik Phase 3-4\'te eklenecek.\n' +
        'Şimdilik /yardim yazarak komutları görebilirsin.'
    );
});

// =============================================
// Bilinmeyen mesajlar
// =============================================
bot.on('message:text', async (ctx) => {
    // Komut olmayan metin mesajları
    if (!ctx.message.text.startsWith('/')) {
        await ctx.reply(
            '🤔 Anlamadım. Komutlar için /yardim yaz.\n\n' +
            '📸 Fotoğraf göndererek başlayabilirsin!'
        );
    }
});

// Bilinmeyen komutlar
bot.on('message', async (ctx) => {
    if (ctx.message?.text?.startsWith('/')) {
        await ctx.reply('❓ Bilinmeyen komut. /yardim yazarak komut listesini görebilirsin.');
    }
});

// =============================================
// Hata Yönetimi
// =============================================
bot.catch((err) => {
    const ctx = err.ctx;
    const e = err.error;

    console.error(`[HATA] ${ctx.updateType} güncellemesi işlenirken hata:`);

    if (e instanceof GrammyError) {
        console.error(`  Telegram API hatası: ${e.description}`);
    } else if (e instanceof HttpError) {
        console.error(`  HTTP hatası: ${e.message}`);
    } else {
        console.error(`  Bilinmeyen hata:`, e);
    }

    // Kullanıcıya hata bildirimi
    ctx.reply('⚠️ Bir hata oluştu. Lütfen tekrar dene.').catch(() => { });
});

// =============================================
// Bot Başlatma
// =============================================
async function startBot() {
    try {
        // Bot bilgilerini al
        const me = await bot.api.getMe();

        console.log('╔══════════════════════════════════════════════════╗');
        console.log(`║  🤖 Bot başlatıldı: @${me.username.padEnd(29)}║`);
        console.log(`║  📛 İsim: ${me.first_name.padEnd(37)}║`);
        console.log(`║  🆔 ID: ${String(me.id).padEnd(39)}║`);
        console.log('║  📡 Mod: Long Polling                            ║');
        console.log('╚══════════════════════════════════════════════════╝');
        console.log();
        console.log('⏳ Mesaj bekleniyor... (Ctrl+C ile durdur)');
        console.log();

        // Long polling ile başlat
        await bot.start({
            onStart: () => { },
            allowed_updates: ['message', 'callback_query'],
        });
    } catch (err) {
        console.error('❌ Bot başlatılamadı:', err.message);

        if (err.message.includes('401') || err.message.includes('Unauthorized')) {
            console.error('💡 Bot token geçersiz. BotFather\'dan yeni token alın.');
        }

        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Bot kapatılıyor...');
    bot.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Bot kapatılıyor...');
    bot.stop();
    process.exit(0);
});

// Başlat!
startBot();
