export const translations = {
    tr: {
        start: {
            welcomeNew: (name) => `🚛 *Hoş geldin, ${name}!*\n\nLojistik Fotoğraf Yönetim Sistemi'ne kaydoldun.\n\n📸 *Nasıl Kullanılır:*\n1️⃣ Araç plakasının fotoğrafını çek ve gönder\n2️⃣ Bot plakayı otomatik okuyacak (OCR)\n3️⃣ Ardından konteyner ve mühür fotoğraflarını gönder\n4️⃣ Tüm fotoğraflar aynı araça gruplanacak\n5️⃣ İşin bittiğinde /done yaz veya 5 dk bekle\n\nℹ️ Detaylı bilgi için /yardim yazabilirsin.`,
            welcomeBack: (name) => `👋 *Tekrar hoş geldin, ${name}!*\n\nHesabın zaten aktif. Fotoğraf göndermeye başlayabilirsin.\n\nℹ️ Komutlar için /yardim yaz.`
        },
        help: {
            text: `📖 *Kullanım Kılavuzu*\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n📸 *Fotoğraf Gönderme:*\n• Araç plakasının fotoğrafını çek ve gönder\n• Bot plakayı otomatik olarak okuyacak (OCR)\n• Ardından konteyner ve mühür fotoğraflarını gönder\n• Tüm fotoğraflar aynı araç kaydına gruplanır\n\n⏱ *Oturum (Session):*\n• İlk plaka fotoğrafı yeni bir oturum açar\n• Sonraki fotoğraflar aynı oturuma eklenir\n• 5 dakika işlem yapılmazsa oturum kapanır\n• Manuel kapatma: /done\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n🔧 *Komutlar:*\n/start  → Botu başlat / hesap oluştur\n/yardim → Bu yardım mesajı\n/durum  → Aktif oturum bilgisi\n/done   → Aktif oturumu kapat\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n💡 *İpuçları:*\n• Plaka fotoğrafını net ve düz açıyla çekin\n• Her araç için önce plaka, sonra diğer fotoğrafları gönderin\n• OCR plakayı okuyamazsa, plakayı elle yazabilirsiniz\n\n❓ Sorun yaşarsan yöneticine başvur.`
        },
        status: {
            noSession: '📭 Aktif bir oturumun yok.\n\n📸 Plaka fotoğrafı göndererek yeni oturum başlatabilirsin.',
            activeSession: (plate, count, mins, secs, timeout) => `📋 *Aktif Oturum Bilgisi*\n\n🚛 Plaka: \`${plate}\`\n📸 Fotoğraf: ${count} adet\n⏱ Süre: ${mins > 0 ? `${mins}dk ` : ''}${secs}sn\n⏰ Timeout: ${timeout}\n\n📸 Fotoğraf göndermeye devam edebilirsin.\n✅ Bitirdiğinde /done yaz.`
        },
        done: {
            noSession: '📭 Aktif bir oturumun yok.\n\n📸 Plaka fotoğrafı göndererek yeni oturum başlatabilirsin.',
            sessionClosed: (plate, count, mins, secs) => `✅ *Oturum kapatıldı*\n\n🚛 Plaka: \`${plate}\`\n📸 Fotoğraf: ${count} adet\n⏱ Süre: ${mins > 0 ? `${mins}dk ` : ''}${secs}sn\n\n📸 Yeni plaka fotoğrafı göndererek başka bir oturum başlatabilirsin.`
        },
        photo: {
            processing: '🔍 Plaka okunuyor...',
            ocrResult: (plate, confidence) => `🔍 *OCR Tahmini:* \`${plate}\`\n📊 Güven: ${confidence}%\n\nLütfen seçim yapın:`,
            ocrFailed: `⚠️ *Plaka okunamadı*\n\n✏️ Lütfen plaka numarasını *elle yaz*\nÖrnek: \`34 ABC 1234\``,
            photoAdded: (count, plate) => `📸 Fotoğraf eklendi! (${count}. fotoğraf)\n🚛 Plaka: \`${plate}\`\n\n📸 Göndermeye devam et veya /done ile bitir.`,
            errorProcessPhoto: '❌ Fotoğraf işlenirken bir hata oluştu. Tekrar dene.',
            errorPhotoFail: '❌ Fotoğraf işlenirken hata oluştu.\n\n✏️ Plaka numarasını elle yazabilirsin (örn: `34 ABC 1234`)',
            btnApprove: (plate) => `✅ Onayla: ${plate}`,
            btnEdit: '✏️ Düzenle',
            btnCancel: '❌ İptal',
            plateShort: '⚠️ Plaka çok kısa. Lütfen tam plaka numarasını yaz.',
            plateSaved: (plate, timeout) => `✅ *Plaka kaydedildi!*\n\n🚛 Plaka: \`${plate}\`\n✏️ Manuel giriş\n\n📸 Şimdi konteyner ve mühür fotoğraflarını gönderebilirsin.\n⏰ ${timeout} içinde otomatik kapanır veya /done ile bitir.`,
            errorSavePlate: '❌ Plaka kaydedilirken hata oluştu. Tekrar dene.',
            cbTimeout: '⚠️ Zaman aşımı veya geçersiz işlem.',
            plateApproved: (plate) => `✅ *Plaka onaylandı:* \`${plate}\``,
            sessionStarted: (plate) => `✅ *Oturum Başlatıldı!*\n\n🚛 Plaka: \`${plate}\`\n\n📸 Şimdi diğer fotoğrafları (konteyner, mühür vb.) gönderebilirsin.`,
            cbError: '❌ Bir hata oluştu.',
            cbManualPrompt: 'ℹ️ Lütfen plaka numarasını aşağıya manuel olarak yazın.'
        },
        session: {
            timeoutMsg: (plate, count) => `⏰ *Oturum otomatik kapandı*\n\n🚛 Plaka: \`${plate}\`\n📸 Fotoğraf: ${count} adet\n\n📸 Yeni plaka fotoğrafı göndererek başka bir oturum başlatabilirsin.`
        },
        index: {
            unknownCommand: '❓ Bilinmeyen komut. /yardim yazarak komut listesini görebilirsin.',
            unknownText: '🤔 Anlamadım. Komutlar için /yardim yaz.\n\n📸 Fotoğraf göndererek başlayabilirsin!',
            sendPlatePrompt: (query) => `🚀 Plakayı Gönder: ${query}`,
            writePlatePrompt: '✏️ Plakayı buraya yazın...',
            editDesc: 'Düzenlediğiniz bu plakayı onaylamak için buraya dokunun.',
            fixDesc: 'Botun okuduğu plakadaki hatayı düzeltip bu kutucuğa tıklayın.',
            emptyQuery: 'Lütfen bir plaka yazın.',
            errorOccurred: '⚠️ Bir hata oluştu. Lütfen tekrar dene.',
            restartTimeoutMsg: (plate, count) => `⏰ *Oturum otomatik kapandı*\n\n🚛 Plaka: \`${plate}\`\n📸 Fotoğraf: ${count} adet`
        },
        conversation: {
            editPrompt: '✏️ *Plaka Düzenleme*\n\nDoğru plaka numarasını aşağıya yazın.\nÖrnek: `34 ABC 1234`\n\n💡 İptal etmek için /iptal yazın.',
            editPromptWithSuggestion: (plate) => `✏️ *Plaka Düzenleme*\n\nOCR önerisi: \`${plate}\`\nDoğru plaka numarasını aşağıya yazın.\nÖrnek: \`34 ABC 1234\`\n\n💡 İptal etmek için /iptal yazın.`,
            expectText: '⚠️ Lütfen plaka numarasını *metin* olarak yazın.',
            cancelled: '🚫 Plaka girişi iptal edildi.',
            cancelledByCommand: '🚫 Komut algılandı — plaka girişi iptal edildi.',
            tooManyAttempts: '❌ Çok fazla hatalı deneme. Lütfen tekrar fotoğraf gönderin.',
        },
        offline: {
            recoveryNotice: (plate, delaySec) => `📡 *Çevrimdışı Kurtarma*\n\n🔄 Geç ulaşan fotoğrafınız *${delaySec}s* gecikme ile \`${plate}\` oturumuna eklendi.\n📸 Göndermeye devam edebilirsiniz.`,
        },
        errors: {
            noUser: '❌ Kullanıcı bilgisi alınamadı.',
            errorStart: '❌ Bir hata oluştu. Lütfen tekrar dene.',
            errorStatus: '❌ Durum bilgisi alınırken hata oluştu.',
            errorDone: '❌ Oturum kapatılırken hata oluştu.'
        }
    },
    en: {
        start: {
            welcomeNew: (name) => `🚛 *Welcome, ${name}!*\n\nYou have registered to the Logistics Photo Management System.\n\n📸 *How to Use:*\n1️⃣ Take a photo of the vehicle plate and send it\n2️⃣ Bot will automatically read the plate (OCR)\n3️⃣ Then send container and seal photos\n4️⃣ All photos will be grouped to the same vehicle\n5️⃣ When finished, type /done or wait 5 mins\n\nℹ️ Type /help for more information.`,
            welcomeBack: (name) => `👋 *Welcome back, ${name}!*\n\nYour account is already active. You can start sending photos.\n\nℹ️ Type /help for commands.`
        },
        help: {
            text: `📖 *User Guide*\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n📸 *Sending Photos:*\n• Take a photo of the vehicle plate and send it\n• Bot will automatically read the plate (OCR)\n• Then send container and seal photos\n• All photos are grouped into the same vehicle record\n\n⏱ *Session:*\n• The first plate photo opens a new session\n• Subsequent photos are added to the same session\n• Unattended for 5 minutes, session auto-closes\n• Manual close: /done\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n🔧 *Commands:*\n/start  → Start bot / create account\n/help   → This help message\n/status → Active session info\n/done   → Close active session\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n💡 *Tips:*\n• Take clear and straight photos of plates\n• For each vehicle, send plate first, then other photos\n• If OCR fails, you can type the plate manually\n\n❓ Contact your admin if you have issues.`
        },
        status: {
            noSession: '📭 You do not have an active session.\n\n📸 You can start a new session by sending a plate photo.',
            activeSession: (plate, count, mins, secs, timeout) => `📋 *Active Session Info*\n\n🚛 Plate: \`${plate}\`\n📸 Photos: ${count}\n⏱ Duration: ${mins > 0 ? `${mins}m ` : ''}${secs}s\n⏰ Timeout: ${timeout}\n\n📸 You can continue sending photos.\n✅ Type /done when finished.`
        },
        done: {
            noSession: '📭 You do not have an active session.\n\n📸 You can start a new session by sending a plate photo.',
            sessionClosed: (plate, count, mins, secs) => `✅ *Session closed*\n\n🚛 Plate: \`${plate}\`\n📸 Photos: ${count}\n⏱ Duration: ${mins > 0 ? `${mins}m ` : ''}${secs}s\n\n📸 You can start another session by sending a new plate photo.`
        },
        photo: {
            processing: '🔍 Reading plate...',
            ocrResult: (plate, confidence) => `🔍 *OCR Estimate:* \`${plate}\`\n📊 Confidence: ${confidence}%\n\nPlease select:`,
            ocrFailed: `⚠️ *Plate could not be read*\n\n✏️ Please *type* the plate number manually\nExample: \`34 ABC 1234\``,
            photoAdded: (count, plate) => `📸 Photo added! (Photo ${count})\n🚛 Plate: \`${plate}\`\n\n📸 Continue sending or finish with /done.`,
            errorProcessPhoto: '❌ An error occurred processing the photo. Try again.',
            errorPhotoFail: '❌ Error processing photo.\n\n✏️ You can type the plate manually (e.g., \`34 ABC 1234\`)',
            btnApprove: (plate) => `✅ Approve: ${plate}`,
            btnEdit: '✏️ Edit',
            btnCancel: '❌ Cancel',
            plateShort: '⚠️ Plate is too short. Please write the full plate number.',
            plateSaved: (plate, timeout) => `✅ *Plate saved!*\n\n🚛 Plate: \`${plate}\`\n✏️ Manual entry\n\n📸 You can now send container and seal photos.\n⏰ Auto-closes in ${timeout} or finish with /done.`,
            errorSavePlate: '❌ Error saving plate. Try again.',
            cbTimeout: '⚠️ Timeout or invalid action.',
            plateApproved: (plate) => `✅ *Plate approved:* \`${plate}\``,
            sessionStarted: (plate) => `✅ *Session Started!*\n\n🚛 Plate: \`${plate}\`\n\n📸 You can now send other photos (container, seal, etc.).`,
            cbError: '❌ An error occurred.',
            cbManualPrompt: 'ℹ️ Please type the plate number manually below.'
        },
        session: {
            timeoutMsg: (plate, count) => `⏰ *Session auto-closed*\n\n🚛 Plate: \`${plate}\`\n📸 Photos: ${count}\n\n📸 You can start another session by sending a new plate photo.`
        },
        index: {
            unknownCommand: '❓ Unknown command. Type /help to see the list of commands.',
            unknownText: '🤔 I did not understand. Type /help for commands.\n\n📸 You can start by sending a photo!',
            sendPlatePrompt: (query) => `🚀 Send Plate: ${query}`,
            writePlatePrompt: '✏️ Write plate here...',
            editDesc: 'Tap here to confirm the plate you edited.',
            fixDesc: 'Correct the error in the bot\'s read plate and tap this box.',
            emptyQuery: 'Please write a plate.',
            errorOccurred: '⚠️ An error occurred. Please try again.',
            restartTimeoutMsg: (plate, count) => `⏰ *Session auto-closed*\n\n🚛 Plate: \`${plate}\`\n📸 Photos: ${count}`
        },
        conversation: {
            editPrompt: '✏️ *Edit Plate*\n\nType the correct plate number below.\nExample: `34 ABC 1234`\n\n💡 Type /cancel to abort.',
            editPromptWithSuggestion: (plate) => `✏️ *Edit Plate*\n\nOCR suggestion: \`${plate}\`\nType the correct plate number below.\nExample: \`34 ABC 1234\`\n\n💡 Type /cancel to abort.`,
            expectText: '⚠️ Please type the plate number as *text*.',
            cancelled: '🚫 Plate entry cancelled.',
            cancelledByCommand: '🚫 Command detected — plate entry cancelled.',
            tooManyAttempts: '❌ Too many invalid attempts. Please send a photo again.',
        },
        offline: {
            recoveryNotice: (plate, delaySec) => `📡 *Offline Recovery*\n\n🔄 Your delayed photo (*${delaySec}s* late) was added to the \`${plate}\` session.\n📸 You can continue sending photos.`,
        },
        errors: {
            noUser: '❌ Could not retrieve user info.',
            errorStart: '❌ An error occurred. Please try again.',
            errorStatus: '❌ Error retrieving status info.',
            errorDone: '❌ Error closing session.'
        }
    }
};

export function getLang(ctx) {
    const code = ctx.from?.language_code;
    return code && code.startsWith('en') ? 'en' : 'tr';
}

export function t(lang, section, key, ...args) {
    if (!translations[lang] || !translations[lang][section] || translations[lang][section][key] === undefined) {
        // Fallback to tr
        if (translations['tr'][section] && translations['tr'][section][key] !== undefined) {
            const val = translations['tr'][section][key];
            return typeof val === 'function' ? val(...args) : val;
        }
        return `missing_translation_${section}_${key}`;
    }
    const val = translations[lang][section][key];
    return typeof val === 'function' ? val(...args) : val;
}
