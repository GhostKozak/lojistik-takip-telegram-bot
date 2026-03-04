/**
 * Lojistik Fotoğraf Yönetim Botu — Ana Giriş Noktası
 * Telegram bot instance, middleware zinciri ve komut kayıtları
 */

import 'dotenv/config';
import { Bot, GrammyError, HttpError } from 'grammy';
import { handleStart } from './handlers/start.js';
import { handleHelp } from './handlers/help.js';
import { handleDone } from './handlers/done.js';
import { handleStatus } from './handlers/status.js';
import { handlePhoto, handleManualPlateInput, handleCallbackQuery } from './handlers/photo.js';
import { recoverOpenSessions } from './session.js';

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
bot.command('done', handleDone);
bot.command('bitti', handleDone); // Türkçe alias
bot.command('durum', handleStatus);
bot.command('status', handleStatus); // İngilizce alias

// =============================================
// Fotoğraf Handler — OCR + Session akışı
// =============================================
bot.on('message:photo', handlePhoto);

// =============================================
// Metin Mesajları (Manuel plaka girişi + bilinmeyen)
// =============================================
bot.on('message:text', async (ctx) => {
    // Komutları atla (zaten yukarıda handle ediliyor)
    if (ctx.message.text.startsWith('/')) {
        await ctx.reply('❓ Bilinmeyen komut. /yardim yazarak komut listesini görebilirsin.');
        return;
    }

    // Manuel plaka girişi bekliyor muyuz?
    const handled = await handleManualPlateInput(ctx);
    if (handled) return;

    // Bilinmeyen metin
    await ctx.reply(
        '🤔 Anlamadım. Komutlar için /yardim yaz.\n\n' +
        '📸 Fotoğraf göndererek başlayabilirsin!'
    );
});

// =============================================
// Buton Tıklamaları (Inline Buttons)
// =============================================
bot.on('callback_query', handleCallbackQuery);

// =============================================
// Inline Sorgular (Düzenle Butonu İçin)
// =============================================
bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim();

    // Query boş olsa bile sonuç dön ki "yükleniyor" (spinner) takılı kalmasın
    const results = [
        {
            type: 'article',
            id: 'send_plate',
            title: query ? `🚀 Plakayı Gönder: ${query.toUpperCase()}` : '✏️ Plakayı buraya yazın...',
            description: query
                ? 'Düzenlediğiniz bu plakayı onaylamak için buraya dokunun.'
                : 'Botun okuduğu plakadaki hatayı düzeltip bu kutucuğa tıklayın.',
            input_message_content: {
                message_text: query || 'Hatalı işlem',
            },
        }
    ];

    // Eğer query boşsa, gönder butonunu etkisiz kılalım (çarpı yerine rehberlik etsin)
    if (!query) {
        results[0].input_message_content.message_text = "Lütfen bir plaka yazın.";
    }

    await ctx.answerInlineQuery(results, {
        cache_time: 0,
        is_personal: true
    });
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

        // Açık session'ları yükle (restart recovery)
        await recoverOpenSessions((telegramId, session) => {
            bot.api.sendMessage(
                telegramId,
                `⏰ *Oturum otomatik kapandı*\n\n` +
                `🚛 Plaka: \`${session.plateNumber}\`\n` +
                `📸 Fotoğraf: ${session.photoCount} adet`,
                { parse_mode: 'Markdown' }
            ).catch(() => { });
        });

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
