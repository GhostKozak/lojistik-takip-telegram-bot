/**
 * OCR Modülü — Birim Testi
 * Çoklu ülke plaka normalizasyon testleri (30+ ülke)
 */

import { normalizePlate } from '../ocr.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// =============================================
// BALKANLAR
// =============================================

describe('🇧🇬 Bulgaristan', () => {
    it('CB 4644 EB', () => {
        assert.equal(normalizePlate('CB 4644 EB'), 'CB 4644 EB');
        assert.equal(normalizePlate('cb4644eb'), 'CB 4644 EB');
    });
    it('PB 1256 EH', () => {
        assert.equal(normalizePlate('PB 1256 EH'), 'PB 1256 EH');
        assert.equal(normalizePlate('pb1256eh'), 'PB 1256 EH');
    });
});

describe('🇷🇴 Romanya', () => {
    it('B 123 ABC (Bükreş)', () => {
        assert.equal(normalizePlate('B 123 ABC'), 'B 123 ABC');
        assert.equal(normalizePlate('B123ABC'), 'B 123 ABC');
    });
    it('CJ 12 ABC (diğer iller)', () => {
        assert.equal(normalizePlate('CJ 12 ABC'), 'CJ 12 ABC');
        assert.equal(normalizePlate('CJ12ABC'), 'CJ 12 ABC');
    });
});

describe('🇷🇸 Sırbistan / 🇭🇷 Hırvatistan', () => {
    it('BG 123 AB (Sırbistan)', () => {
        assert.equal(normalizePlate('BG 123 AB'), 'BG 123 AB');
        assert.equal(normalizePlate('BG123AB'), 'BG 123 AB');
    });
    it('ZG 1234 AB (Hırvatistan)', () => {
        assert.equal(normalizePlate('ZG 1234 AB'), 'ZG 1234 AB');
        assert.equal(normalizePlate('ZG1234AB'), 'ZG 1234 AB');
    });
});

describe('🇲🇰 K.Makedonya / 🇲🇪 Karadağ', () => {
    it('MK KB 124 (boşluklu giriş)', () => {
        assert.equal(normalizePlate('MK KB 124'), 'MK KB 124');
        assert.equal(normalizePlate('mk kb 124'), 'MK KB 124');
    });
    it('Boşluksuz belirsiz kalır', () => {
        assert.equal(normalizePlate('MKKB124'), 'MKKB124');
    });
});

describe('🇧🇦 Bosna', () => {
    it('A12 A 123', () => {
        assert.equal(normalizePlate('A12 A 123'), 'A12 A 123');
        assert.equal(normalizePlate('A12A123'), 'A12 A 123');
    });
});

describe('🇬🇷 Yunanistan', () => {
    it('ABC 1234', () => {
        assert.equal(normalizePlate('ABC 1234'), 'ABC 1234');
        assert.equal(normalizePlate('ABC1234'), 'ABC 1234');
    });
});

// =============================================
// KAFKASYA
// =============================================

describe('🇦🇿 Azerbaycan', () => {
    it('99 AZ 908', () => {
        assert.equal(normalizePlate('99 AZ 908'), '99 AZ 908');
        assert.equal(normalizePlate('99AZ908'), '99 AZ 908');
    });
});

describe('🇬🇪 Gürcistan / 🇲🇩 Moldova / 🇭🇺 Macaristan', () => {
    it('ABC 123 (3 harf + 3 rakam)', () => {
        assert.equal(normalizePlate('ABC 123'), 'ABC 123');
        assert.equal(normalizePlate('ABC123'), 'ABC 123');
    });
});

// =============================================
// DOĞU AVRUPA
// =============================================

describe('🇺🇦 Ukrayna', () => {
    it('AA 1234 AA', () => {
        assert.equal(normalizePlate('AA 1234 AA'), 'AA 1234 AA');
        assert.equal(normalizePlate('AA1234AA'), 'AA 1234 AA');
    });
});

describe('🇵🇱 Polonya', () => {
    it('WA 12345', () => {
        assert.equal(normalizePlate('WA 12345'), 'WA 12345');
        assert.equal(normalizePlate('WA12345'), 'WA 12345');
    });
});

describe('🇨🇿 Çekya', () => {
    it('1A2 3456', () => {
        assert.equal(normalizePlate('1A2 3456'), '1A2 3456');
        assert.equal(normalizePlate('1A23456'), '1A2 3456');
    });
});

describe('🇧🇾 Belarus', () => {
    it('1234 AB 1', () => {
        assert.equal(normalizePlate('1234 AB 1'), '1234 AB 1');
        assert.equal(normalizePlate('1234AB1'), '1234 AB 1');
    });
});

// =============================================
// BATI AVRUPA
// =============================================

describe('🇫🇷 Fransa / 🇮🇹 İtalya', () => {
    it('AB 123 CD', () => {
        assert.equal(normalizePlate('AB 123 CD'), 'AB 123 CD');
        assert.equal(normalizePlate('AB123CD'), 'AB 123 CD');
    });
});

describe('🇳🇱 Hollanda', () => {
    it('AB 12 CD', () => {
        assert.equal(normalizePlate('AB 12 CD'), 'AB 12 CD');
        assert.equal(normalizePlate('AB12CD'), 'AB 12 CD');
    });
});

describe('🇦🇹 Avusturya', () => {
    it('W 12345 A', () => {
        assert.equal(normalizePlate('W 12345 A'), 'W 12345 A');
        assert.equal(normalizePlate('W12345A'), 'W 12345 A');
    });
});

describe('🇧🇪 Belçika', () => {
    it('1 ABC 123', () => {
        assert.equal(normalizePlate('1 ABC 123'), '1 ABC 123');
        assert.equal(normalizePlate('1ABC123'), '1 ABC 123');
    });
});

// =============================================
// ORTA ASYA
// =============================================

describe('🇰🇿 Kazakistan', () => {
    it('123 ABC 01', () => {
        assert.equal(normalizePlate('123 ABC 01'), '123 ABC 01');
        assert.equal(normalizePlate('123ABC01'), '123 ABC 01');
    });
});

describe('🇺🇿 Özbekistan', () => {
    it('01 A 123 AA', () => {
        assert.equal(normalizePlate('01 A 123 AA'), '01 A 123 AA');
        assert.equal(normalizePlate('01A123AA'), '01 A 123 AA');
    });
});

describe('🇹🇲 Türkmenistan', () => {
    it('AG 1234', () => {
        assert.equal(normalizePlate('AG 1234'), 'AG 1234');
        assert.equal(normalizePlate('AG1234'), 'AG 1234');
    });
});

// =============================================
// TÜRK PLAKASI
// =============================================

describe('🇹🇷 Türkiye', () => {
    it('34 ABC 1234', () => {
        assert.equal(normalizePlate('34ABC1234'), '34 ABC 1234');
        assert.equal(normalizePlate('34 ABC 1234'), '34 ABC 1234');
    });
    it('06 B 1234', () => {
        assert.equal(normalizePlate('06 B 1234'), '06 B 1234');
    });
});

// =============================================
// GENEL VE EDGE CASE
// =============================================

describe('Genel ve edge case', () => {
    it('Boşluksuz bilinmeyen: AHDH124', () => {
        assert.equal(normalizePlate('AHDH124'), 'AHDH124');
        assert.equal(normalizePlate('ahdh124'), 'AHDH124');
    });
    it('Boş ve null değerler', () => {
        assert.equal(normalizePlate(''), '');
        assert.equal(normalizePlate(null), '');
        assert.equal(normalizePlate(undefined), '');
    });
});
