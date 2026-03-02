/**
 * OCR Modülü — Tesseract.js ile Plaka Tanıma
 * Çoklu ülke plaka formatlarını destekler
 * 
 * Desteklenen formatlar:
 *   CB 4644 EB  (Bulgaristan)
 *   PB 1256 EH  (Bulgaristan)
 *   MK KB 124   (Makedonya)
 *   99 AZ 908   (Azerbaycan)
 *   AHDH124     (Boşluksuz)
 *   34 ABC 1234 (Türkiye)
 *   vb.
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

    // --- Pattern'ler (en spesifikten en genele) ---

    // Türk plakası: 34 ABC 1234 veya 34ABC1234
    const turkishPattern = /\b(\d{2}\s?[A-Z]{1,3}\s?\d{2,4})\b/g;

    // Bulgaristan tipi: CB 4644 EB veya CB4644EB
    const bgPattern = /\b([A-Z]{1,2}\s?\d{4}\s?[A-Z]{1,2})\b/g;

    // Makedonya tipi: MK KB 124
    const mkPattern = /\b([A-Z]{2}\s?[A-Z]{2}\s?\d{3,4})\b/g;

    // Azerbaycan tipi: 99 AZ 908
    const azPattern = /\b(\d{2}\s?[A-Z]{2}\s?\d{3})\b/g;

    // Genel: Harf+Rakam karışık, 4-10 karakter (boşluksuz)
    const generalPattern = /\b([A-Z0-9]{4,10})\b/g;

    // Boşluklu genel: 2-3 parçalı plaka
    const spacedPattern = /\b([A-Z0-9]{2,4}\s[A-Z0-9]{2,4}(?:\s[A-Z0-9]{2,4})?)\b/g;

    // Spesifik pattern'leri dene
    for (const pattern of [turkishPattern, bgPattern, mkPattern, azPattern, spacedPattern]) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const candidate = match[1].trim();
            if (candidate.length >= 4 && !candidates.includes(candidate)) {
                candidates.push(candidate);
            }
        }
    }

    // Genel pattern (son çare)
    if (candidates.length === 0) {
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

    // Bilinen formatları algılayıp güzel formatlama uygula

    // Türk: 34ABC1234 → 34 ABC 1234
    const turkMatch = clean.match(/^(\d{2})([A-Z]{1,3})(\d{2,4})$/);
    if (turkMatch) return `${turkMatch[1]} ${turkMatch[2]} ${turkMatch[3]}`;

    // Bulgaristan: CB4644EB → CB 4644 EB
    const bgMatch = clean.match(/^([A-Z]{1,2})(\d{4})([A-Z]{1,2})$/);
    if (bgMatch) return `${bgMatch[1]} ${bgMatch[2]} ${bgMatch[3]}`;

    // Azerbaycan: 99AZ908 → 99 AZ 908
    const azMatch = clean.match(/^(\d{2})([A-Z]{2})(\d{3})$/);
    if (azMatch) return `${azMatch[1]} ${azMatch[2]} ${azMatch[3]}`;

    // Makedonya: MKKB124 → MK KB 124
    // Sadece orijinal girişte boşluk varsa veya tam 7 karakter ise (2+2+3)
    // AHDH124 gibi belirsiz olanları yakalamaktan kaçın
    if (plate.includes(' ')) {
        const mkMatch = clean.match(/^([A-Z]{2})([A-Z]{2})(\d{3,4})$/);
        if (mkMatch) return `${mkMatch[1]} ${mkMatch[2]} ${mkMatch[3]}`;
    }

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
