/**
 * Dosya Yükleme Pipeline
 * Telegram fotoğraflarını Supabase Storage'a aktarır.
 * 
 * Akış:
 *   1. Telegram API'den dosya indir → Buffer
 *   2. Sharp ile optimize et (JPEG, max 1920px)
 *   3. Supabase Storage'a upload
 *   4. Public URL oluştur
 */

import sharp from 'sharp';
import { supabase } from './db.js';

const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'vehicle-photos';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_WIDTH = 1920;
const JPEG_QUALITY = 80;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

/**
 * Telegram API'den dosyayı indir
 * @param {string} fileId - Telegram file_id
 * @param {string} botToken - Bot token
 * @returns {Promise<Buffer>} Dosya içeriği
 */
export async function downloadTelegramFile(fileId, botToken) {
    // 1. File path'i al
    const fileInfo = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileInfo.json();

    if (!fileData.ok || !fileData.result?.file_path) {
        throw new Error(`Telegram dosya bilgisi alınamadı: ${fileData.description || 'bilinmeyen hata'}`);
    }

    // 2. Dosyayı indir
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    const response = await fetch(fileUrl);

    if (!response.ok) {
        throw new Error(`Telegram dosya indirme hatası: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Boyut kontrolü
    if (buffer.length > MAX_FILE_SIZE) {
        throw new Error(`Dosya çok büyük: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (limit: ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }

    console.log(`[UPLOAD] 📥 İndirildi: ${(buffer.length / 1024).toFixed(0)}KB`);
    return buffer;
}

/**
 * Resmi optimize et (JPEG, boyut küçültme)
 * @param {Buffer} buffer - Ham resim verisi
 * @returns {Promise<Buffer>} Optimize edilmiş JPEG buffer
 */
export async function optimizeImage(buffer) {
    try {
        const optimized = await sharp(buffer)
            .resize(MAX_WIDTH, null, {
                withoutEnlargement: true,
                fit: 'inside',
            })
            .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
            .toBuffer();

        const savings = ((1 - optimized.length / buffer.length) * 100).toFixed(0);
        console.log(`[UPLOAD] 🗜️ Optimize: ${(buffer.length / 1024).toFixed(0)}KB → ${(optimized.length / 1024).toFixed(0)}KB (${savings}% küçüldü)`);

        return optimized;
    } catch (err) {
        console.warn(`[UPLOAD] ⚠️ Optimizasyon başarısız, orijinal kullanılıyor: ${err.message}`);
        return buffer;
    }
}

/**
 * Supabase Storage'a dosya yükle (retry mekanizması ile)
 * @param {Buffer} buffer - Yüklenecek dosya
 * @param {string} storagePath - Storage'daki hedef yol
 * @returns {Promise<{storagePath: string, publicUrl: string}>}
 */
export async function uploadToStorage(buffer, storagePath) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const { data, error } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(storagePath, buffer, {
                    contentType: 'image/jpeg',
                    upsert: false,
                });

            if (error) {
                throw new Error(error.message);
            }

            // Public URL oluştur
            const { data: urlData } = supabase.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(storagePath);

            const publicUrl = urlData.publicUrl;

            console.log(`[UPLOAD] ✅ Yüklendi: ${storagePath}`);

            return { storagePath, publicUrl };
        } catch (err) {
            lastError = err;
            console.warn(`[UPLOAD] ⚠️ Deneme ${attempt}/${MAX_RETRIES} başarısız: ${err.message}`);

            if (attempt < MAX_RETRIES) {
                const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                console.log(`[UPLOAD] ⏳ ${delay}ms sonra tekrar denenecek...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw new Error(`Storage upload ${MAX_RETRIES} denemede başarısız: ${lastError.message}`);
}

/**
 * Storage path oluştur
 * Format: {plate}/{YYYY-MM-DD_HHmmss}.jpg
 * @param {string} plateNumber - Normalize edilmiş plaka
 * @returns {string} Storage path
 */
export function generateStoragePath(plateNumber) {
    // Plaka'yı dosya sistemine uygun hale getir (boşlukları kaldır)
    const safePlate = plateNumber.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    const now = new Date();
    const timestamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('-') + '_' + [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
    ].join('');
    return `${safePlate}/${timestamp}.jpg`;
}

/**
 * Ana pipeline: Telegram dosyası → optimize → Supabase Storage
 * @param {object} params
 * @param {string} params.fileId - Telegram file_id
 * @param {string} params.botToken - Bot token
 * @param {string} params.plateNumber - Normalize edilmiş plaka
 * @param {Buffer} [params.buffer] - Önceden indirilmiş buffer (varsa tekrar indirmez)
 * @returns {Promise<{storagePath: string, publicUrl: string}>}
 */
export async function uploadPhotoFromTelegram({ fileId, botToken, plateNumber, buffer }) {
    try {
        // 1. İndir (buffer verilmemişse)
        if (!buffer) {
            buffer = await downloadTelegramFile(fileId, botToken);
        }

        // 2. Optimize et
        const optimized = await optimizeImage(buffer);

        // 3. Storage path oluştur
        const storagePath = generateStoragePath(plateNumber);

        // 4. Upload
        const result = await uploadToStorage(optimized, storagePath);

        console.log(`[UPLOAD] 🎉 Pipeline tamamlandı: ${plateNumber} → ${storagePath}`);

        return result;
    } catch (err) {
        console.error(`[UPLOAD] ❌ Pipeline hatası: ${err.message}`);
        throw err;
    }
}
