/**
 * ⚠️ NOT: Bu modül şu an aktif olarak kullanılmamaktadır (Sistem PlateRecognizer.com API'si üzerinden çalışmaktadır).
 * İleride Tesseract veya farklı bir yerel OCR motoruna geçiş yapılması durumunda ön-işleme ve bölge kırpma 
 * stratejileri için referans olarak tutulmaktadır.
 * 
 * Plaka Dedektörü — Görüntü ön-işleme + bölge bazlı tarama
 * 
 * Strateji:
 *   1. Orijinal görüntüyü sharp ile ön-işle (gri tonlama, kontrast, keskinleştirme)
 *   2. Farklı bölgeleri kırp (plakalar genellikle alt-orta kısımda olur)
 *   3. Her bölgeyi ayrı ayrı Tesseract'a gönder
 *   4. En iyi plaka sonucunu döndür
 */

import sharp from 'sharp';

/**
 * Görüntüyü plaka okuma için optimize et
 * @param {Buffer} imageBuffer - Orijinal fotoğraf
 * @returns {Promise<Buffer>} Ön-işlenmiş (grayscale + contrast + sharpen) buffer
 */
export async function preprocessForOcr(imageBuffer) {
    return sharp(imageBuffer)
        .grayscale()                         // Gri tonlama
        .normalize()                         // Histogram normalizasyonu (kontrast)
        .sharpen({ sigma: 2 })               // Keskinleştir
        .linear(1.5, -(128 * 0.5))           // Kontrastı artır
        .threshold(140)                      // Binarize (siyah-beyaz)
        .toBuffer();
}

/**
 * Görüntüyü plaka okuma için optimize et (yumuşak versiyon — binarize yok)
 * Bazı plakalarda threshold çok agresif olabiliyor
 * @param {Buffer} imageBuffer
 * @returns {Promise<Buffer>}
 */
export async function preprocessSoft(imageBuffer) {
    return sharp(imageBuffer)
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.5 })
        .linear(1.3, -(128 * 0.3))
        .toBuffer();
}

/**
 * Fotoğraftan potansiyel plaka bölgelerini kırp
 * Plakalar genellikle aracın alt-orta kısmında bulunur
 * 
 * @param {Buffer} imageBuffer - Orijinal fotoğraf
 * @returns {Promise<{name: string, buffer: Buffer}[]>} Kırpılmış bölgeler
 */
export async function extractPlateRegions(imageBuffer) {
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;

    if (!width || !height) {
        console.log('[DETECT] Görüntü metadata okunamadı');
        return [];
    }

    console.log(`[DETECT] Görüntü boyutu: ${width}x${height}`);

    const regions = [];

    // --- Bölge stratejisi ---
    // Plakalar genellikle aracın bumper bölgesinde, alt yarıda ve yatay olarak merkeze yakın

    const cropDefs = [
        // Alt yarı (en olası plaka bölgesi)
        {
            name: 'alt-yarı',
            left: 0,
            top: Math.round(height * 0.5),
            width: width,
            height: Math.round(height * 0.5),
        },
        // Alt üçte bir
        {
            name: 'alt-1/3',
            left: 0,
            top: Math.round(height * 0.65),
            width: width,
            height: Math.round(height * 0.35),
        },
        // Orta şerit (yatay ortadaki %60, dikey alt %50)
        {
            name: 'orta-alt',
            left: Math.round(width * 0.2),
            top: Math.round(height * 0.4),
            width: Math.round(width * 0.6),
            height: Math.round(height * 0.5),
        },
        // Üst yarı (nadir ama bazen plaka üstte olabilir)
        {
            name: 'üst-yarı',
            left: 0,
            top: 0,
            width: width,
            height: Math.round(height * 0.5),
        },
        // Tam görüntü (son çare)
        {
            name: 'tam',
            left: 0,
            top: 0,
            width: width,
            height: height,
        },
    ];

    for (const crop of cropDefs) {
        // Minimum boyut kontrolü
        if (crop.width < 50 || crop.height < 20) continue;

        try {
            const cropped = await sharp(imageBuffer)
                .extract({
                    left: crop.left,
                    top: crop.top,
                    width: crop.width,
                    height: crop.height,
                })
                .toBuffer();

            regions.push({ name: crop.name, buffer: cropped });
        } catch (err) {
            console.log(`[DETECT] Kırpma hatası (${crop.name}): ${err.message}`);
        }
    }

    console.log(`[DETECT] ${regions.length} bölge oluşturuldu`);
    return regions;
}

/**
 * Bir bölgenin ön-işlenmiş versiyonlarını oluştur
 * @param {Buffer} regionBuffer - Bölge buffer'ı
 * @returns {Promise<{name: string, buffer: Buffer}[]>}
 */
export async function createPreprocessedVariants(regionBuffer) {
    const variants = [];

    try {
        // 1. Sert ön-işleme (yüksek kontrast + threshold)
        const hard = await preprocessForOcr(regionBuffer);
        variants.push({ name: 'hard', buffer: hard });
    } catch { /* skip */ }

    try {
        // 2. Yumuşak ön-işleme (threshold yok)
        const soft = await preprocessSoft(regionBuffer);
        variants.push({ name: 'soft', buffer: soft });
    } catch { /* skip */ }

    try {
        // 3. Büyütülmüş (küçük plakalar için 2x)
        const metadata = await sharp(regionBuffer).metadata();
        if (metadata.width && metadata.width < 800) {
            const enlarged = await sharp(regionBuffer)
                .resize(metadata.width * 2, null, { fit: 'inside' })
                .grayscale()
                .normalize()
                .sharpen({ sigma: 1.5 })
                .toBuffer();
            variants.push({ name: 'enlarged', buffer: enlarged });
        }
    } catch { /* skip */ }

    return variants;
}
