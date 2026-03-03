import express from 'express';
import multer from 'multer';
import { recognizePlate } from './ocr.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// Main Page
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'tester.html');
    res.sendFile(htmlPath);
});

// Process Route
app.post('/test', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Dosya yok' });

    try {
        console.log(`[TESTER] Fotoğraf alndı: ${req.file.originalname} (${req.file.size} bytes)`);
        const result = await recognizePlate(req.file.buffer);
        res.json(result);
    } catch (err) {
        console.error('[TESTER] Hata:', err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3030;
app.listen(PORT, () => {
    console.log(`
=========================================
🚀 OCR TESTER DASHBOARD (CLOUD v1.0)
=========================================
🔗 Adres: http://localhost:${PORT}

Motor: PlateRecognizer.com (Cloud API)

Özellikler:
- Yüksek doğruluklu AB/TR plaka tespiti
- Bulut tabanlı görselleştirme
- Toplu sürükle-bırak test desteği
=========================================
`);
});
