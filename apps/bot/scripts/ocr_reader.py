"""
⚠️ NOT: Bu dosya şu an aktif olarak kullanılmamaktadır. Sistem şu an API tabanlı (PlateRecognizer.com) çalışmaktadır. 
İleride buluttan yerel OCR işlemine (Local + YOLOv8 + EasyOCR) geçiş yapılması planları dahilinde referans olması amacıyla tutulmaktadır.

YOLOv8 + EasyOCR Plaka Okuma Script'i — Gelişmiş Tespit ve Birleştirme v5

- YOLO ile plaka bölgesi kesilip OCR'a gönderilir (Dahili Kırpma).
- Kırpılan bölgelerin koordinatları orijinal resme göre offset'lenir.
- Marka ve gürültü filtreleri iyileştirilmiştir.
"""

import sys
import json
import easyocr
import re
import cv2
import numpy as np
import os
from ultralytics import YOLO

# Global modeller
_reader = None
_plate_model = None

# Plaka üzerinde sıkça görülen gürültü metinler
BLACKLIST_WORDS = {
    'TIRSAN', 'SCHMITZ', 'KRONE', 'KASSBOHRER', 'TR', 'E', 'D', 'NL', 'F', 'GB', 'PL', 
    'RO', 'BG', 'UA', 'TIR', 'STOP', 'CHASSIS', 'TRAILER', 'CARGOBULL', 'KOGEL', 'LAMBERET',
    'FRUEHAUF', 'WIELTON', 'PILOT', 'IVECO', 'SCANIA', 'VOLVO', 'MAN', 'DAF', 'RENAULT',
    'MERCEDES', 'BENZ', 'ACTROS', '30', '40', '50', '60', '70', '80', '90', 'WWWCARGOBULLCOM',
    'KOLUMAN', 'KOLUMANCOM', 'TEL', 'TELEFON', 'FAX', 'PHONE', 'MOBILE'
}

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.int_, np.intc, np.intp, np.int8, np.int16, np.int32, np.int64, np.uint8, np.uint16, np.uint32, np.uint64)):
            return int(obj)
        elif isinstance(obj, (np.float16, np.float32, np.float64)):
            return float(obj)
        elif isinstance(obj, (np.ndarray,)):
            return obj.tolist()
        return json.JSONEncoder.default(self, obj)

def get_reader():
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    return _reader

def get_plate_model():
    global _plate_model
    if _plate_model is None:
        try:
            _plate_model = YOLO('keremberke/yolov8n-license-plate-detector', task='detect')
        except Exception:
            _plate_model = YOLO('yolov8n.pt') 
    return _plate_model

def get_bbox_metrics(bbox):
    x_coords = [float(p[0]) for p in bbox]
    y_coords = [float(p[1]) for p in bbox]
    xmin, xmax, ymin, ymax = min(x_coords), max(x_coords), min(y_coords), max(y_coords)
    return {
        'xmin': xmin, 'xmax': xmax, 'ymin': ymin, 'ymax': ymax,
        'width': xmax - xmin, 'height': ymax - ymin,
        'cy': (ymin + ymax) / 2, 'cx': (xmin + xmax) / 2
    }

def extract_plate_candidates(results, img_height, off_x=0, off_y=0):
    if not results: return []

    processed = []
    for bbox, text, conf in results:
        clean = text.strip().upper().replace(' ', '')
        if clean in BLACKLIST_WORDS or len(clean) < 1: continue
        metrics = get_bbox_metrics(bbox)
        # Marka yazısı filtresi
        if metrics['height'] > img_height * 0.35: continue
        processed.append({'bbox': bbox, 'metrics': metrics, 'text': text, 'conf': float(conf)})

    if not processed: return []

    # 1. Satır Birleştirme Mantığı
    processed.sort(key=lambda x: x['metrics']['xmin'])
    clusters = []
    pool = list(processed)
    while pool:
        base = pool.pop(0)
        cls = [base]
        i = 0
        while i < len(pool):
            curr = pool[i]
            m, last_m = curr['metrics'], cls[-1]['metrics']
            y_diff = abs(m['cy'] - last_m['cy'])
            y_tol = max(m['height'], last_m['height']) * 1.1
            x_gap = m['xmin'] - last_m['xmax']
            x_tol = last_m['width'] * 2.5
            if y_diff < y_tol and x_gap < x_tol:
                cls.append(pool.pop(i))
            else: i += 1
        clusters.append(cls)

    # 2. Merged Listesi oluştur (Birleştirilmiş + Tekil parçalar)
    merged_pool = []
    for cls in clusters:
        full_text = " ".join([c['text'] for c in cls])
        clean = re.sub(r'[^A-Z0-9]', '', full_text.upper())
        x_min, x_max = min([c['metrics']['xmin'] for c in cls]), max([c['metrics']['xmax'] for c in cls])
        y_min, y_max = min([c['metrics']['ymin'] for c in cls]), max([c['metrics']['ymax'] for c in cls])
        
        merged_pool.append({
            'text': full_text, 'clean': clean, 'conf': sum([c['conf'] for c in cls]) / len(cls),
            'width': x_max - x_min, 'height': y_max - y_min,
            'bbox': [[x_min, y_min], [x_max, y_min], [x_max, y_max], [x_min, y_max]]
        })
        if len(cls) > 1:
            for item in cls:
                merged_pool.append({
                    'text': item['text'], 'clean': re.sub(r'[^A-Z0-9]', '', item['text'].upper()),
                    'conf': item['conf'], 'width': item['metrics']['width'], 'height': item['metrics']['height'],
                    'bbox': item['bbox']
                })

    # 3. Puanlama & Koordinat Ofsetleme
    final = []
    for m in merged_pool:
        clean = m['clean']
        if len(clean) < 4 or len(clean) > 15 or clean in BLACKLIST_WORDS: continue
        if re.search(r'\d{7,}', clean) or 'TEL' in m['text'].upper(): continue
        if not (re.search(r'[A-Z]', clean) and re.search(r'\d', clean)): continue

        aspect = m['width'] / m['height'] if m['height'] > 0 else 0
        score = m['conf']
        if 2.2 <= aspect <= 8.5: score *= 1.6
        if re.search(r'\d{2}[A-Z]{1,3}\d{2,4}', clean) or re.search(r'[A-Z]{2}\d{4}[A-Z]{2}', clean): 
            score *= 3.0
        
        abs_bbox = [[float(p[0]) + off_x, float(p[1]) + off_y] for p in m['bbox']]
        final.append({
            'text': m['text'].upper(), 'no_space': clean, 'confidence': float(m['conf']),
            'conf': float(m['conf']), 'plate_score': float(score), 'aspect_ratio': float(aspect), 'bbox': abs_bbox
        })

    final.sort(key=lambda x: x['plate_score'], reverse=True)
    return final

def main():
    try:
        image_data = sys.stdin.buffer.read()
        if not image_data: return
        img = cv2.imdecode(np.frombuffer(image_data, np.uint8), cv2.IMREAD_COLOR)
        if img is None: return
        h_img, w_img, _ = img.shape

        p_model = get_plate_model()
        p_res = p_model(img, conf=0.10, verbose=False)
        
        # Hedefleri (crop'ları) hazırla
        targets = [] # (img, off_x, off_y)
        for r in p_res:
            for box in r.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                m_h, m_w = (y2-y1)*0.25, (x2-x1)*0.25
                nx1, ny1, nx2, ny2 = max(0, int(x1-m_w)), max(0, int(y1-m_h)), min(w_img, int(x2+m_w)), min(h_img, int(y2+m_h))
                targets.append((img[ny1:ny2, nx1:nx2], nx1, ny1))
        
        if not targets: targets.append((img, 0, 0))

        reader = get_reader()
        all_cand, all_txt = [], []
        for target_img, off_x, off_y in targets:
            ocr_res = reader.readtext(target_img)
            all_cand.extend(extract_plate_candidates(ocr_res, target_img.shape[0], off_x, off_y))
            for (bbox, text, conf) in ocr_res:
                abs_bbox = [[float(p[0]) + off_x, float(p[1]) + off_y] for p in bbox]
                all_txt.append({'text': text, 'confidence': float(conf), 'bbox': abs_bbox})

        unique = []
        seen = set()
        for c in all_cand:
            if c['no_space'] not in seen:
                unique.append(c); seen.add(c['no_space'])
        unique.sort(key=lambda x: x['plate_score'], reverse=True)

        print(json.dumps({
            'candidates': unique[:5], 'all_texts': all_txt,
            'yolo_detections': int(len(targets) if targets[0][1] != 0 or targets[0][2] != 0 else 0),
            'total_detections': int(len(all_txt))
        }, cls=NumpyEncoder, ensure_ascii=False))

    except Exception as e:
        sys.stderr.write(f"ERR: {str(e)}\n")
        print(json.dumps({'error': str(e), 'candidates': []}))

if __name__ == '__main__':
    main()
