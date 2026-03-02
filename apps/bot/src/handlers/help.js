/**
 * /yardim Komutu — Kullanım Kılavuzu
 * Bot kullanım talimatlarını gösterir.
 */

/**
 * /yardim komut handler'ı
 * @param {import('grammy').Context} ctx
 */
export async function handleHelp(ctx) {
    const helpMessage = `📖 *Kullanım Kılavuzu*

━━━━━━━━━━━━━━━━━━━━━━

📸 *Fotoğraf Gönderme:*
• Araç plakasının fotoğrafını çek ve gönder
• Bot plakayı otomatik olarak okuyacak (OCR)
• Ardından konteyner ve mühür fotoğraflarını gönder
• Tüm fotoğraflar aynı araç kaydına gruplanır

⏱ *Oturum (Session):*
• İlk plaka fotoğrafı yeni bir oturum açar
• Sonraki fotoğraflar aynı oturuma eklenir
• 5 dakika işlem yapılmazsa oturum kapanır
• Manuel kapatma: /done

━━━━━━━━━━━━━━━━━━━━━━

🔧 *Komutlar:*
/start  → Botu başlat / hesap oluştur
/yardim → Bu yardım mesajı
/durum  → Aktif oturum bilgisi
/done   → Aktif oturumu kapat

━━━━━━━━━━━━━━━━━━━━━━

💡 *İpuçları:*
• Plaka fotoğrafını net ve düz açıyla çekin
• Her araç için önce plaka, sonra diğer fotoğrafları gönderin
• OCR plakayı okuyamazsa, plakayı elle yazabilirsiniz

❓ Sorun yaşarsan yöneticine başvur.`;

    await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
    console.log(`[YARDIM] ${ctx.from?.first_name} (${ctx.from?.id})`);
}
