/**
 * OCR Modülü — Tesseract.js ile Plaka Tanıma
 * 30+ ülke plaka formatını destekler
 * 
 * Desteklenen bölgeler ve örnek formatlar:
 * 
 * 🇹🇷 Türkiye:     34 ABC 1234, 06 B 12
 * 
 * 🇧🇬 Bulgaristan:  CB 4644 EB, PB 1256 EH
 * 🇷🇴 Romanya:      B 123 ABC, CJ 12 ABC
 * 🇷🇸 Sırbistan:    BG 123 AB
 * 🇭🇷 Hırvatistan:  ZG 1234 AB
 * 🇸🇮 Slovenya:     LJ 123 AB
 * 🇦🇱 Arnavutluk:   AA 123 AA
 * 🇽🇰 Kosova:       01 123 AA
 * 🇲🇪 Karadağ:      PG AB 123
 * 🇧🇦 Bosna:        A12 A 123, T12 A 123
 * 🇲🇰 K.Makedonya:  MK KB 124
 * 🇬🇷 Yunanistan:   ABC 1234
 * 
 * 🇦🇿 Azerbaycan:   99 AZ 908
 * 🇬🇪 Gürcistan:    ABC 123
 * 🇦🇲 Ermenistan:   01 AA 001
 * 
 * 🇺🇦 Ukrayna:      AA 1234 AA, BT 1234 AA
 * 🇲🇩 Moldova:      ABC 123
 * 🇵🇱 Polonya:      WA 12345, DW 12345
 * 🇭🇺 Macaristan:   ABC 123
 * 🇨🇿 Çekya:        1A2 3456
 * 🇸🇰 Slovakya:     BA 123 AB
 * 🇧🇾 Belarus:      1234 AB 1
 * 
 * 🇩🇪 Almanya:      B AB 1234, M XY 123
 * 🇫🇷 Fransa:       AB 123 CD
 * 🇮🇹 İtalya:       AB 123 CD
 * 🇳🇱 Hollanda:     AB 12 CD, 12 ABC 3
 * 🇦🇹 Avusturya:    W 12345 A
 * 🇧🇪 Belçika:      1 ABC 123
 * 
 * 🇰🇿 Kazakistan:   123 ABC 01
 * 🇺🇿 Özbekistan:   01 A 123 AA
 * 🇹🇲 Türkmenistan:  AG 1234
 * 
 * + Genel alfanumerik fallback
 */

import Tesseract from 'tesseract.js';

const CONFIDENCE_THRESHOLD = parseFloat(process.env.OCR_CONFIDENCE_THRESHOLD || '0.4');

// Tesseract worker (singleton, lazy-init)
let worker = null;

/**
 * Tesseract worker'ı başlat (lazy initialization)
 * @returns {Promise<Tesseract.Worker>}
 */
async function getWorker() {
    if (!worker) {
        console.log('[OCR] Tesseract worker başlatılıyor...');
        worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
            // Logger kapalı (production'da gereksiz)
        });

        // Plaka tanıma için optimize — sadece büyük harf ve rakam
        await worker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        });

        console.log('[OCR] ✅ Worker hazır');
    }
    return worker;
}

/**
 * OCR ham çıktısını temizle ve normalize et
 * @param {string} raw - Ham OCR çıktısı
 * @returns {string} Temizlenmiş metin
 */
function cleanOcrText(raw) {
    if (!raw) return '';

    return raw
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')  // Sadece harf, rakam, boşluk
        .replace(/\s+/g, ' ')          // Çoklu boşlukları teke indir
        .trim();
}

/**
 * OCR çıktısından yaygın hatalı karakter okumalarını düzelt
 * @param {string} text
 * @returns {string}
 */
function fixCommonMisreads(text) {
    return text
        .replace(/O(?=\d)/g, '0')   // Rakam yanındaki O → 0
        .replace(/(?<=\d)O/g, '0')  // Rakam yanındaki O → 0
        .replace(/(?<=\d)I/g, '1')  // Rakam yanındaki I → 1
        .replace(/(?<=\d)L/g, '1')  // Rakam yanındaki L → 1
        .replace(/(?<=\d)S/g, '5')  // Rakam yanındaki S → 5
        .replace(/(?<=\d)B/g, '8')  // Rakam yanındaki B → 8
        .replace(/(?<=\d)G/g, '6')  // Rakam yanındaki G → 6
        .replace(/(?<=\d)Z/g, '2')  // Rakam yanındaki Z → 2
        .replace(/(?<=[A-Z])0/g, 'O')  // Harf yanındaki 0 → O
        .replace(/(?<=[A-Z])1/g, 'I')  // Harf yanındaki 1 → I (dikkatli kullan)
        ;
}

/**
 * Plaka benzeri pattern'leri metinden çıkar
 * Çoklu ülke formatlarını destekler
 * @param {string} text - Temizlenmiş OCR metni
 * @returns {string[]} Bulunan plaka adayları
 */
function extractPlateCandidates(text) {
    const candidates = [];

    /**
     * Aday ekle (tekrar kontrolü ile)
     */
    function addCandidate(c) {
        const trimmed = c.trim();
        if (trimmed.length >= 4 && !candidates.includes(trimmed)) {
            candidates.push(trimmed);
        }
    }

    /**
     * Pattern ile eşleştirip adayları topla
     */
    function matchAll(pattern) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            addCandidate(match[1]);
        }
    }

    // =============================================
    // Spesifik ülke pattern'leri (en spesifikten en genele)
    // =============================================

    // --- TÜRK PLAKASı ---
    // 34 ABC 1234, 06 B 12, 81 AB 123
    matchAll(/\b(\d{2}\s?[A-Z]{1,3}\s?\d{2,4})\b/g);

    // --- BALKANLAR ---

    // Bulgaristan: CB 4644 EB, PB 1256 EH (Harf1-2 Rakam4 Harf1-2)
    matchAll(/\b([A-Z]{1,2}\s?\d{4}\s?[A-Z]{1,2})\b/g);

    // Romanya: B 123 ABC, CJ 12 ABC (Harf1-2 Rakam2-3 Harf3)
    matchAll(/\b([A-Z]{1,2}\s?\d{2,3}\s?[A-Z]{3})\b/g);

    // Sırbistan: BG 123 AB (Harf2 Rakam3-4 Harf2)
    matchAll(/\b([A-Z]{2}\s?\d{3,4}\s?[A-Z]{2})\b/g);

    // Hırvatistan: ZG 1234 AB (Harf2 Rakam3-4 Harf2)
    // (Sırbistan pattern'i ile aynı — kapsar)

    // Slovenya: LJ 123 AB (Harf2 Rakam3 Harf2) — Sırbistan kapsar

    // Arnavutluk: AA 123 AA (Harf2 Rakam3 Harf2) — Sırbistan kapsar

    // Kosova: 01 123 AA (Rakam2 Rakam3 Harf2)
    matchAll(/\b(\d{2}\s?\d{3}\s?[A-Z]{2})\b/g);

    // Karadağ: PG AB 123 (Harf2 Harf2 Rakam3)
    matchAll(/\b([A-Z]{2}\s?[A-Z]{2}\s?\d{3,4})\b/g);

    // K.Makedonya: MK KB 124 — Karadağ pattern'i kapsar

    // Bosna: A12 A 123, T12 A 123 (Harf1 Rakam2 Harf1 Rakam3)
    matchAll(/\b([A-Z]\d{2}\s?[A-Z]\s?\d{3})\b/g);

    // Yunanistan: ABC 1234 (Harf3 Rakam4)
    matchAll(/\b([A-Z]{3}\s?\d{4})\b/g);

    // --- KAFKASYA ---

    // Azerbaycan: 99 AZ 908 (Rakam2 Harf2 Rakam3)
    matchAll(/\b(\d{2}\s?[A-Z]{2}\s?\d{3})\b/g);

    // Gürcistan: ABC 123 (Harf3 Rakam3)
    matchAll(/\b([A-Z]{3}\s?\d{3})\b/g);

    // Ermenistan: 01 AA 001 (Rakam2 Harf2 Rakam3) — Azerbaycan kapsar

    // --- DOĞU AVRUPA ---

    // Ukrayna: AA 1234 AA (Harf2 Rakam4 Harf2)
    matchAll(/\b([A-Z]{2}\s?\d{4}\s?[A-Z]{2})\b/g);

    // Polonya: WA 12345, DW 12345 (Harf2-3 Rakam5)
    matchAll(/\b([A-Z]{2,3}\s?\d{5})\b/g);

    // Macaristan: ABC 123 (Harf3 Rakam3) — Gürcistan kapsar

    // Çekya: 1A2 3456 (Rakam1 Harf1 Rakam1 Rakam4)
    matchAll(/\b(\d[A-Z]\d\s?\d{4})\b/g);

    // Slovakya: BA 123 AB (Harf2 Rakam3 Harf2) — Sırbistan kapsar

    // Belarus: 1234 AB 1 (Rakam4 Harf2 Rakam1)
    matchAll(/\b(\d{4}\s?[A-Z]{2}\s?\d)\b/g);

    // Moldova: ABC 123 — Gürcistan kapsar

    // --- BATI AVRUPA ---

    // Almanya: B AB 1234, M XY 123 (Harf1-3 Harf1-2 Rakam1-4)
    matchAll(/\b([A-Z]{1,3}\s?[A-Z]{1,2}\s?\d{1,4})\b/g);

    // Fransa / İtalya: AB 123 CD (Harf2 Rakam3 Harf2) — Sırbistan kapsar

    // Hollanda: AB 12 CD (Harf2 Rakam2 Harf2)
    matchAll(/\b([A-Z]{2}\s?\d{2}\s?[A-Z]{2})\b/g);

    // Avusturya: W 12345 A (Harf1 Rakam3-5 Harf1)
    matchAll(/\b([A-Z]\s?\d{3,5}\s?[A-Z])\b/g);

    // Belçika: 1 ABC 123 (Rakam1 Harf3 Rakam3)
    matchAll(/\b(\d\s?[A-Z]{3}\s?\d{3})\b/g);

    // --- ORTA ASYA ---

    // Kazakistan: 123 ABC 01 (Rakam3 Harf3 Rakam2)
    matchAll(/\b(\d{3}\s?[A-Z]{3}\s?\d{2})\b/g);

    // Özbekistan: 01 A 123 AA (Rakam2 Harf1 Rakam3 Harf2)
    matchAll(/\b(\d{2}\s?[A-Z]\s?\d{3}\s?[A-Z]{2})\b/g);

    // Türkmenistan: AG 1234 (Harf2 Rakam4) — Bulgaristan kapsar

    // =============================================
    // Genel boşluklu pattern: 2-4 parçalı plaka
    // =============================================
    matchAll(/\b([A-Z0-9]{2,4}\s[A-Z0-9]{2,5}(?:\s[A-Z0-9]{2,4})?)\b/g);

    // =============================================
    // Genel fallback: boşluksuz alfanumerik (son çare)
    // =============================================
    if (candidates.length === 0) {
        const generalPattern = /\b([A-Z0-9]{4,10})\b/g;
        let match;
        while ((match = generalPattern.exec(text)) !== null) {
            const candidate = match[1].trim();
            // En az 1 harf ve 1 rakam içermeli
            if (
                candidate.length >= 4 &&
                /[A-Z]/.test(candidate) &&
                /\d/.test(candidate) &&
                !candidates.includes(candidate)
            ) {
                candidates.push(candidate);
            }
        }
    }

    return candidates;
}

/**
 * Plaka numarasını normalize et (gösterim için)
 * @param {string} plate - Ham plaka metni
 * @returns {string} Normalize edilmiş plaka
 */
export function normalizePlate(plate) {
    if (!plate) return '';

    // Tüm boşlukları kaldır, büyük harfe çevir
    const clean = plate.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
    const hasSpace = plate.includes(' ');

    // =============================================
    // 3 parçalı formatlar: X-Y-Z
    // =============================================

    // 🇹🇷 Türkiye: 34ABC1234 → 34 ABC 1234
    const turkMatch = clean.match(/^(\d{2})([A-Z]{1,3})(\d{2,4})$/);
    if (turkMatch) return `${turkMatch[1]} ${turkMatch[2]} ${turkMatch[3]}`;

    // 🇧🇬 Bulgaristan / 🇺🇦 Ukrayna: CB4644EB → CB 4644 EB
    const bgUaMatch = clean.match(/^([A-Z]{1,2})(\d{4})([A-Z]{1,2})$/);
    if (bgUaMatch) return `${bgUaMatch[1]} ${bgUaMatch[2]} ${bgUaMatch[3]}`;

    // 🇷🇸 Sırbistan / 🇭🇷 Hırvatistan / 🇫🇷 Fransa / 🇮🇹 İtalya: BG123AB → BG 123 AB
    const rsMatch = clean.match(/^([A-Z]{2})(\d{3,4})([A-Z]{2})$/);
    if (rsMatch) return `${rsMatch[1]} ${rsMatch[2]} ${rsMatch[3]}`;

    // 🇷🇴 Romanya (Bükreş): B123ABC → B 123 ABC
    const roBMatch = clean.match(/^([A-Z])(\d{2,3})([A-Z]{3})$/);
    if (roBMatch) return `${roBMatch[1]} ${roBMatch[2]} ${roBMatch[3]}`;

    // 🇷🇴 Romanya (diğer): CJ12ABC → CJ 12 ABC
    const roMatch = clean.match(/^([A-Z]{2})(\d{2,3})([A-Z]{3})$/);
    if (roMatch) return `${roMatch[1]} ${roMatch[2]} ${roMatch[3]}`;

    // 🇦🇿 Azerbaycan / 🇦🇲 Ermenistan: 99AZ908 → 99 AZ 908
    const azMatch = clean.match(/^(\d{2})([A-Z]{2})(\d{3})$/);
    if (azMatch) return `${azMatch[1]} ${azMatch[2]} ${azMatch[3]}`;

    // 🇰🇿 Kazakistan: 123ABC01 → 123 ABC 01
    const kzMatch = clean.match(/^(\d{3})([A-Z]{3})(\d{2})$/);
    if (kzMatch) return `${kzMatch[1]} ${kzMatch[2]} ${kzMatch[3]}`;

    // 🇳🇱 Hollanda: AB12CD → AB 12 CD
    const nlMatch = clean.match(/^([A-Z]{2})(\d{2})([A-Z]{2})$/);
    if (nlMatch) return `${nlMatch[1]} ${nlMatch[2]} ${nlMatch[3]}`;

    // 🇲🇰 K.Makedonya / 🇲🇪 Karadağ: MKKB124 → MK KB 124
    // Sadece girişte boşluk varsa (AHDH124 gibi belirsiz olanlarla karışmasın)
    if (hasSpace) {
        const mkMatch = clean.match(/^([A-Z]{2})([A-Z]{2})(\d{3,4})$/);
        if (mkMatch) return `${mkMatch[1]} ${mkMatch[2]} ${mkMatch[3]}`;
    }

    // 🇧🇦 Bosna: A12A123 → A12 A 123
    const baMatch = clean.match(/^([A-Z]\d{2})([A-Z])(\d{3})$/);
    if (baMatch) return `${baMatch[1]} ${baMatch[2]} ${baMatch[3]}`;

    // 🇧🇾 Belarus: 1234AB1 → 1234 AB 1
    const byMatch = clean.match(/^(\d{4})([A-Z]{2})(\d)$/);
    if (byMatch) return `${byMatch[1]} ${byMatch[2]} ${byMatch[3]}`;

    // 🇧🇪 Belçika: 1ABC123 → 1 ABC 123
    const beMatch = clean.match(/^(\d)([A-Z]{3})(\d{3})$/);
    if (beMatch) return `${beMatch[1]} ${beMatch[2]} ${beMatch[3]}`;

    // 🇦🇹 Avusturya: W12345A → W 12345 A
    const atMatch = clean.match(/^([A-Z])(\d{3,5})([A-Z])$/);
    if (atMatch) return `${atMatch[1]} ${atMatch[2]} ${atMatch[3]}`;

    // =============================================
    // 4 parçalı formatlar
    // =============================================

    // 🇺🇿 Özbekistan: 01A123AA → 01 A 123 AA
    const uzMatch = clean.match(/^(\d{2})([A-Z])(\d{3})([A-Z]{2})$/);
    if (uzMatch) return `${uzMatch[1]} ${uzMatch[2]} ${uzMatch[3]} ${uzMatch[4]}`;

    // =============================================
    // 2 parçalı formatlar
    // =============================================

    // 🇬🇷 Yunanistan / 🇭🇺 Macaristan: ABC1234 → ABC 1234
    const grMatch = clean.match(/^([A-Z]{3})(\d{3,4})$/);
    if (grMatch) return `${grMatch[1]} ${grMatch[2]}`;

    // 🇵🇱 Polonya: WA12345 → WA 12345
    const plMatch = clean.match(/^([A-Z]{2,3})(\d{5})$/);
    if (plMatch) return `${plMatch[1]} ${plMatch[2]}`;

    // 🇨🇿 Çekya: 1A23456 → 1A2 3456
    const czMatch = clean.match(/^(\d[A-Z]\d)(\d{4})$/);
    if (czMatch) return `${czMatch[1]} ${czMatch[2]}`;

    // 🇹🇲 Türkmenistan: AG1234 → AG 1234
    const tmMatch = clean.match(/^([A-Z]{2})(\d{4})$/);
    if (tmMatch) return `${tmMatch[1]} ${tmMatch[2]}`;

    // Bilinmeyen format — olduğu gibi döndür (büyük harf)
    return clean;
}

/**
 * Fotoğraftan plaka numarası tanı
 * @param {Buffer} imageBuffer - Fotoğraf buffer'ı
 * @returns {Promise<{plate: string|null, raw: string, confidence: number, candidates: string[]}>}
 */
export async function recognizePlate(imageBuffer) {
    const w = await getWorker();

    console.log('[OCR] Fotoğraf işleniyor...');
    const startTime = Date.now();

    const { data } = await w.recognize(imageBuffer);

    const duration = Date.now() - startTime;
    console.log(`[OCR] İşlem süresi: ${duration}ms, ham metin: "${data.text.trim()}", güven: ${(data.confidence / 100).toFixed(2)}`);

    // Metni temizle
    const cleanedText = cleanOcrText(data.text);
    const fixedText = fixCommonMisreads(cleanedText);

    console.log(`[OCR] Temizlenmiş: "${fixedText}"`);

    // Plaka adaylarını çıkar
    const candidates = extractPlateCandidates(fixedText);
    console.log(`[OCR] Adaylar: [${candidates.join(', ')}]`);

    // Güven kontrolü
    const confidence = data.confidence / 100;

    if (candidates.length === 0 || confidence < CONFIDENCE_THRESHOLD) {
        console.log(`[OCR] ❌ Plaka bulunamadı (güven: ${confidence.toFixed(2)}, eşik: ${CONFIDENCE_THRESHOLD})`);
        return {
            plate: null,
            raw: data.text.trim(),
            confidence,
            candidates,
        };
    }

    // En iyi aday (ilk eşleşen — spesifik pattern'ler önce denenir)
    const bestCandidate = candidates[0];
    const normalizedPlate = normalizePlate(bestCandidate);

    console.log(`[OCR] ✅ Plaka: "${normalizedPlate}" (güven: ${confidence.toFixed(2)})`);

    return {
        plate: normalizedPlate,
        raw: data.text.trim(),
        confidence,
        candidates: candidates.map(normalizePlate),
    };
}

/**
 * OCR worker'ı kapat (cleanup)
 */
export async function terminateWorker() {
    if (worker) {
        await worker.terminate();
        worker = null;
        console.log('[OCR] Worker kapatıldı');
    }
}
