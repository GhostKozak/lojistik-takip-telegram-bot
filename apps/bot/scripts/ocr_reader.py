"""
EasyOCR Plaka Okuma Script'i

Node.js'den çağrılır, stdin'den görüntü alır, JSON formatında sonuç döndürür.

Kullanım:
    python scripts/ocr_reader.py < image.jpg
    veya
    cat image.jpg | python scripts/ocr_reader.py
"""

import sys
import json
import easyocr
import io
import re

# EasyOCR reader — İngilizce (Latin harfler yeterli plakalar için)
# İlk çalıştırmada model indirilir (~100MB)
reader = None

def get_reader():
    global reader
    if reader is None:
        reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    return reader

def extract_plate_candidates(results):
    """
    EasyOCR sonuçlarından plaka adaylarını çıkar.
    Her sonuç: (bbox, text, confidence)
    
    Plaka seçme kriterleri:
    - En az 1 harf ve 1 rakam içermeli
    - 4-15 karakter arası
    - Yüksek güven skoru
    """
    candidates = []
    
    for (bbox, text, confidence) in results:
        # Temizle
        clean = re.sub(r'[^A-Za-z0-9\s]', '', text).strip().upper()
        no_space = clean.replace(' ', '')
        
        if len(no_space) < 4 or len(no_space) > 15:
            continue
        
        # En az 1 harf ve 1 rakam  
        has_letter = bool(re.search(r'[A-Z]', no_space))
        has_digit = bool(re.search(r'\d', no_space))
        
        if not (has_letter and has_digit):
            continue
        
        # Bbox genişlik/yükseklik oranı — plakalar yatay dikdörtgendir
        x_coords = [p[0] for p in bbox]
        y_coords = [p[1] for p in bbox]
        box_width = max(x_coords) - min(x_coords)
        box_height = max(y_coords) - min(y_coords)
        
        if box_height > 0:
            aspect_ratio = box_width / box_height
        else:
            aspect_ratio = 0
        
        # Plakalar genellikle en/boy oranı 2-8 arasında
        plate_score = confidence
        if 2.0 <= aspect_ratio <= 8.0:
            plate_score *= 1.5  # Plaka benzeri oran — bonus
        
        candidates.append({
            'text': clean,
            'no_space': no_space,
            'confidence': float(confidence),
            'plate_score': float(plate_score),
            'aspect_ratio': float(aspect_ratio),
            'bbox': [[float(p[0]), float(p[1])] for p in bbox],
        })
    
    # plate_score'a göre sırala (en yüksek önce)
    candidates.sort(key=lambda x: x['plate_score'], reverse=True)
    
    return candidates

def main():
    try:
        # stdin'den görüntü oku
        image_data = sys.stdin.buffer.read()
        
        if not image_data:
            print(json.dumps({'error': 'No image data received', 'candidates': []}))
            sys.exit(1)
        
        r = get_reader()
        
        # EasyOCR ile oku
        results = r.readtext(image_data)
        
        # Plaka adaylarını çıkar
        candidates = extract_plate_candidates(results)
        
        # Tüm OCR sonuçlarını da döndür (debug için)
        all_texts = [
            {
                'text': text.strip(),
                'confidence': float(conf),
            }
            for (_, text, conf) in results
        ]
        
        output = {
            'candidates': candidates,
            'all_texts': all_texts,
            'total_detections': len(results),
        }
        
        print(json.dumps(output, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({
            'error': str(e),
            'candidates': [],
            'all_texts': [],
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()
