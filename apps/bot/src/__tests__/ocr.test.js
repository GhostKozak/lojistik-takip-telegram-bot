/**
 * OCR Modülü — Birim Testi
 * Plaka pattern eşleştirme ve normalizasyon testleri
 */

import { normalizePlate } from '../ocr.js';

// Test framework (Node.js built-in)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// =============================================
// normalizePlate testleri
// =============================================
describe('normalizePlate — Plaka Normalizasyonu', () => {
    it('Bulgaristan formatı: CB 4644 EB', () => {
        assert.equal(normalizePlate('CB 4644 EB'), 'CB 4644 EB');
        assert.equal(normalizePlate('cb 4644 eb'), 'CB 4644 EB');
        assert.equal(normalizePlate('CB4644EB'), 'CB 4644 EB');
    });

    it('Bulgaristan formatı: PB 1256 EH', () => {
        assert.equal(normalizePlate('PB 1256 EH'), 'PB 1256 EH');
        assert.equal(normalizePlate('pb1256eh'), 'PB 1256 EH');
    });

    it('Makedonya formatı: MK KB 124', () => {
        assert.equal(normalizePlate('MK KB 124'), 'MK KB 124');
        assert.equal(normalizePlate('mk kb 124'), 'MK KB 124');
        // Boşluksuz giriş belirsiz — AHDH124 ile karışmasın
        assert.equal(normalizePlate('MKKB124'), 'MKKB124');
    });

    it('Azerbaycan formatı: 99 AZ 908', () => {
        assert.equal(normalizePlate('99 AZ 908'), '99 AZ 908');
        assert.equal(normalizePlate('99AZ908'), '99 AZ 908');
        assert.equal(normalizePlate('99 az 908'), '99 AZ 908');
    });

    it('Boşluksuz karışık: AHDH124', () => {
        // Bilinmeyen format — olduğu gibi büyük harf
        assert.equal(normalizePlate('AHDH124'), 'AHDH124');
        assert.equal(normalizePlate('ahdh124'), 'AHDH124');
    });

    it('Türk plakası: 34 ABC 1234', () => {
        assert.equal(normalizePlate('34ABC1234'), '34 ABC 1234');
        assert.equal(normalizePlate('34 ABC 1234'), '34 ABC 1234');
        assert.equal(normalizePlate('06 B 1234'), '06 B 1234');
    });

    it('Boş ve null değerler', () => {
        assert.equal(normalizePlate(''), '');
        assert.equal(normalizePlate(null), '');
        assert.equal(normalizePlate(undefined), '');
    });
});
