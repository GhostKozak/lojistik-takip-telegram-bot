import fetch from 'node-fetch';
import FormData from 'form-data';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Recognize plate using PlateRecognizer.com API
 * @param {Buffer} imageBuffer - Image as a buffer
 * @returns {Promise<Object>} Processed results
 */
export async function recognizePlate(imageBuffer) {
    const apiToken = process.env.PLATE_RECOGNIZER_TOKEN;

    if (!apiToken || apiToken === 'YOUR_TOKEN_HERE') {
        process.stdout.write(`[OCR] ⚠️ Token Durumu: ${!apiToken ? 'Eksik (undefined)' : 'Placeholder değerinde (YOUR_TOKEN_HERE)'}\n`);
        return { plate: null, raw: '', confidence: 0, candidates: [], debug: { error: 'PLATE_RECOGNIZER_TOKEN ayarlı değil.' } };
    }

    // Token uzunluğunu ve ilk birkaç karakterini logla (Debug için güvenli yol)
    process.stdout.write(`[OCR] 🔑 Token bulundu: ${apiToken.substring(0, 4)}*** (Uzunluk: ${apiToken.length})\n`);

    console.log('[OCR] 🔍 PlateRecognizer API ile plaka tanıma başlatılıyor...');
    const startTime = Date.now();

    try {
        const formData = new FormData();
        formData.append('upload', imageBuffer, { filename: 'plate.jpg' });
        // Turkey plaka bölgesi (isteğe bağlı, API performansını artırabilir)
        formData.append('regions', 'tr');

        const response = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${apiToken}`,
                ...formData.getHeaders()
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        const duration = Date.now() - startTime;

        // Sonuçları işle
        if (result.results && result.results.length > 0) {
            const best = result.results[0];
            const normalizedPlate = best.plate.toUpperCase();
            const confidence = best.score;

            console.log(`[OCR] ✅ PlateRecognizer: "${normalizedPlate}" (güven: ${(confidence * 100).toFixed(1)}%) (${duration}ms)`);

            // Tester/Bot uyumluluğu için veri yapısını standardize et
            return {
                plate: normalizedPlate,
                raw: best.plate,
                confidence: confidence,
                candidates: result.results.map(r => r.plate.toUpperCase()),
                debug: {
                    engine: "PlateRecognizer (Cloud API)",
                    yolo_detections: result.results.length,
                    total_detections: result.results.length,
                    candidates: result.results.map(r => ({
                        text: r.plate.toUpperCase(),
                        confidence: r.score,
                        bbox: [
                            [r.box.xmin, r.box.ymin],
                            [r.box.xmax, r.box.ymin],
                            [r.box.xmax, r.box.ymax],
                            [r.box.xmin, r.box.ymax]
                        ]
                    })),
                    all_texts: result.results.map(r => ({
                        text: r.plate.toUpperCase(),
                        confidence: r.score,
                        bbox: [
                            [r.box.xmin, r.box.ymin],
                            [r.box.xmax, r.box.ymin],
                            [r.box.xmax, r.box.ymax],
                            [r.box.xmin, r.box.ymax]
                        ]
                    }))
                }
            };
        }

        console.log(`[OCR] ❌ Plaka bulunamadı (${duration}ms)`);
        return {
            plate: null,
            raw: '',
            confidence: 0,
            candidates: [],
            debug: {
                engine: "PlateRecognizer (Cloud API)",
                yolo_detections: 0,
                total_detections: 0,
                candidates: [],
                all_texts: []
            }
        };

    } catch (err) {
        console.error('[OCR] ❌ PlateRecognizer Error:', err.message);
        return {
            plate: null,
            raw: '',
            confidence: 0,
            candidates: [],
            debug: { error: err.message }
        };
    }
}

/**
 * Cleanup - PlateRecognizer API'de stateless
 */
export async function terminateWorker() {
    // No worker to terminate for Cloud API
}
