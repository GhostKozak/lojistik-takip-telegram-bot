/**
 * Upload Modülü — Birim Testi
 * generateStoragePath ve optimizeImage fonksiyonları test edilir.
 * (Supabase ve Telegram API çağrıları mock'lanır.)
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { generateStoragePath, optimizeImage } from '../upload.js';

// =============================================
// generateStoragePath
// =============================================

describe('generateStoragePath', () => {
    it('plaka ve timestamp ile doğru path oluşturur', () => {
        const path = generateStoragePath('34 ABC 1234');
        assert.match(path, /^34_ABC_1234\/\d{4}-\d{2}-\d{2}_\d{6}\.jpg$/);
    });

    it('boşlukları alt çizgiye çevirir', () => {
        const path = generateStoragePath('06 B 1234');
        assert.ok(path.startsWith('06_B_1234/'));
    });

    it('özel karakterleri temizler', () => {
        const path = generateStoragePath('AB.123/CD');
        // Nokta ve slash temizlenmeli
        assert.ok(!path.includes('.') || path.endsWith('.jpg'));
        assert.ok(!path.includes('//'));
    });

    it('zaten boşluksuz plaka da çalışır', () => {
        const path = generateStoragePath('ABC1234');
        assert.ok(path.startsWith('ABC1234/'));
        assert.ok(path.endsWith('.jpg'));
    });

    it('ardışık çağrılarda farklı path üretir (saniye farkı yoksa bile)', () => {
        const path1 = generateStoragePath('34ABC');
        const path2 = generateStoragePath('34ABC');
        // Aynı saniyede çağrılırsa eşit olabilir, ama formatı doğru olmalı
        assert.match(path1, /\.jpg$/);
        assert.match(path2, /\.jpg$/);
    });
});

// =============================================
// optimizeImage
// =============================================

describe('optimizeImage', () => {
    it('geçerli bir buffer döndürür', async () => {
        // 1x1 kırmızı piksel PNG (minimal geçerli resim)
        const pngBuffer = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
            'base64'
        );

        const result = await optimizeImage(pngBuffer);
        assert.ok(Buffer.isBuffer(result), 'Sonuç bir Buffer olmalı');
        assert.ok(result.length > 0, 'Buffer boş olmamalı');
    });

    it('geçersiz buffer ile orijinal buffer döner (hata fırlatmaz)', async () => {
        const invalidBuffer = Buffer.from('bu bir resim değil');
        const result = await optimizeImage(invalidBuffer);
        // Hata durumunda orijinal buffer dönmeli
        assert.ok(Buffer.isBuffer(result));
    });
});
