# 📋 Proje İlerleme Takibi — Lojistik Fotoğraf Yönetim Sistemi

> Son güncelleme: 2026-03-04

---

## Phase 0 — Proje Kurulumu ve Altyapı
> 🎯 Hedef: Geliştirme ortamının hazır hale getirilmesi

- [x] Monorepo yapısını oluştur (`apps/bot`, `apps/web`, `supabase/`)
- [x] Git reposunu başlat, `.gitignore` ekle
  ```bash
  git init
  git add .
  git commit -m "chore: initial project structure"
  ```
- [x] Supabase projesi oluştur (dashboard.supabase.com)
- [x] Supabase CLI kur ve yerel geliştirme ortamını bağla
  ```bash
  npx supabase init
  npx supabase link --project-ref <PROJECT_ID>
  ```
- [x] `.env.example` dosyalarını oluştur (bot + web)
- [x] README.md yaz

**Git Checkpoint:**
```bash
git add . && git commit -m "chore: configure supabase and env templates"
```

---

## Phase 1 — Veritabanı Şeması ✅
> 🎯 Hedef: Tüm tabloların ve indekslerin oluşturulması

- [x] `pg_trgm` extension'ı aktifleştir
- [x] `field_users` tablosunu oluştur
- [x] `vehicle_sessions` tablosunu oluştur (plaka bazlı)
- [x] `photos` tablosunu oluştur (session'a bağlı)
- [x] Trigram GIN indeksini oluştur (`plate_number`)
- [x] Performans indekslerini ekle
- [x] Supabase Storage bucket oluştur (`vehicle-photos`)
- [x] RLS politikalarını yaz
- [x] Migration dosyasını test et
  ```bash
  npx supabase db push
  ```

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(db): add initial schema with trigram search"
```

---

## Phase 2 — Telegram Bot Temeli ✅
> 🎯 Hedef: Botun mesaj alıp yanıt verebilir hale gelmesi

- [x] `apps/bot/` dizinini kur, bağımlılıkları yükle
  ```bash
  cd apps/bot && npm init -y
  npm install grammy @supabase/supabase-js tesseract.js dotenv
  ```
- [x] BotFather'dan test bot token'ı al
- [x] `src/index.js` — Bot instance ve middleware zinciri
- [x] `src/db.js` — Supabase client, CRUD fonksiyonları
- [x] `/start` komutu — kullanıcı kaydı
- [x] `/yardim` komutu — kullanım kılavuzu
- [x] Botun çalıştığını doğrula (polling mode)

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(bot): basic bot with start and help commands"
```

---

## Phase 3 — OCR Doğruluğunu Artırma (YOLOv8 + EasyOCR) ✅
> 🎯 Hedef: YOLOv8 ile plaka tespiti ve EasyOCR ile yüksek doğruluklu okuma

- [x] Python ortamı hazırlığı (`easyocr`, `ultralytics`, `opencv`)
- [x] `apps/bot/scripts/ocr_reader.py` — Python hibrit OCR servisi (V5)
- [x] YOLOv8 plaka tespit modeli entegrasyonu (`keremberke/yolov8n-license-plate-detector`)
- [x] Plaka bölgesi kırpma ve koordinat ofsetleme (OpenCV)
- [x] Fallback mekanizması (Plaka bulunamazsa tüm görüntüyü tara)
- [x] `src/ocr.js` — PlateRecognizer.com (Cloud API) entegrasyonu
- [x] `src/tester-server.js` & `tester.html` — Görsel Dashboard (V7)
- [x] Çoklu ülke plaka pattern'leri (TR, BG, EU + genel format)
- [x] `normalizePlate(plate)` — formatı algılayıp güzel gösterim
- [x] OCR güven eşiği (confidence threshold) iyileştirmesi
- [x] Marka ve Telefon numarası filtreleme (Blacklist V5)

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(bot): upgrade OCR to YOLOv8 + EasyOCR hybrid model"
```

---

## Phase 4 — Session Yönetimi ✅
> 🎯 Hedef: Peş peşe atılan fotoğrafları aynı araca gruplama

- [x] `src/session.js` — Session yönetim modülü
- [x] In-memory session map (`activeSessions`)
- [x] 5 dakika timeout mekanizması (otomatik kapanma + bildirim)
- [x] Session açma (OCR başarılı → yeni session)
- [x] Session'a fotoğraf ekleme (açık session varsa)
- [x] `/done` + `/bitti` komutu — erken session kapatma
- [x] `/durum` + `/status` komutu — aktif session bilgisi
- [x] Manuel plaka girişi (OCR başarısız olduğunda)
- [x] Bot restart recovery (DB'deki açık session'ları yükle)
- [x] `src/handlers/photo.js` — OCR + session akışı handler

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(bot): implement session-based photo grouping"
```

---

## Phase 5 — Dosya Yükleme Pipeline ✅
> 🎯 Hedef: Telegram fotoğraflarının Supabase Storage'a aktarılması

- [x] Telegram file download → Buffer dönüşümü
- [x] Supabase Storage'a upload fonksiyonu
- [x] Dosya isimlendirme: `{plate}/{timestamp}_{type}.jpg`
- [x] Public URL oluşturma
- [x] Upload hatalarında retry mekanizması (exponential backoff)
- [x] Dosya boyutu limiti kontrolü (10MB)
- [x] Sharp ile resim optimizasyonu (JPEG, max 1920px)
- [x] `src/upload.js` — Merkezi upload modülü
- [x] `src/handlers/photo.js` — 3 noktada upload entegrasyonu

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(bot): add file upload pipeline to supabase storage"
```

---

## Phase 6 — Web Panel Temeli ✅
> 🎯 Hedef: Next.js iskeletinin hazırlanması

- [x] `apps/web/` dizininde Next.js 14 projesi oluştur
  ```bash
  cd apps/web && npx -y create-next-app@latest ./ --app --src-dir --no-tailwind
  ```
- [x] Supabase JS client kur (`src/lib/supabase.js`)
- [x] Root layout ve global stiller (premium dark theme, glassmorphism)
- [x] Dashboard sayfa iskeleti (`src/app/page.js` + `Dashboard.js`)
- [x] Stats kartları (toplam kayıt, aktif oturum, fotoğraf, kullanıcı)
- [x] Araç kartları grid layout ile listeleme
- [x] Debounced arama çubuğu (300ms)
- [x] Loading skeleton ve empty state tasarımı

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(web): scaffold next.js dashboard"
```

---

## Phase 7 — Arama ve Liste ✅
> 🎯 Hedef: Fuzzy search ile plaka arama ve sonuç listeleme

- [x] `Dashboard.js` — Debounced search input (300ms)
- [x] Supabase `ilike` sorgusu ile arama
- [x] Araç kartları (plaka, durum, kullanıcı, fotoğraf sayısı, tarih, OCR güven)
- [x] StatusBadge — Açık/Kapalı session göstergesi (animasyonlu)
- [x] **Durum Filtresi** — Tümü / Açık / Kapalı sekmeleri ✅
- [x] Sonuçları grid layout ile göster
- [x] Boş durum (empty state) tasarımı
- [x] Yüklenme (loading) skeleton'ları

## Phase 11 — Gelişmiş Özellikler (Devam Ediyor) 🚀
> 🎯 Hedef: Kullanıcı deneyimini premium seviyeye çıkarma

- [x] **Gerçek Zamanlı Güncelleme** — Yeni kayıtlar anında (Realtime Toast) ✅
- [x] **Tarih Filtresi** — GTE/LTE bazlı premium tarih seçici ✅
- [x] **Pagination / Infinite Scroll** — "Daha Fazla Yükle" sistemi ✅
- [x] **Toplu İndirme** — Oturuma ait tüm fotoğrafları ZIP olarak indir (JSZip) ✅
- [x] **Session Notları** — Anlık kaydedilen oturum yorumları ✅
- [x] **Web Paneli Girişi** — Supabase SSR ile Login sayfası ve Route Middleware ✅

**Not:** Realtime özelliğini aktif etmek için `supabase/migrations/002_enable_realtime.sql` dosyasındaki komutların Supabase SQL Editor'da çalıştırılması gerekmektedir.

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(web): add login page, auth middleware and logout button"
```

---

## Phase 8 — Detay Sayfası ve Galeri ✅
> 🎯 Hedef: Araç detayı ve fotoğraf galerisi

- [x] `vehicles/[id]/page.js` — Araç detay sayfası (Server Component)
- [x] `VehicleDetail.js` — Bilgi kartları + fotoğraf galerisi (Client Component)
- [x] Thumbnail grid + Lightbox (klavye navigasyonu: ok tuşları + Escape)
- [x] Fotoğraf indirme butonu
- [x] Responsive tasarım (mobil uyumlu)
- [x] Pending fotoğraf göstergesi (✘ yüklenmemiş)

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(web): add vehicle detail page with photo gallery"
```

---

## Phase 9 — Test ve Kalite Kontrol ✅
> 🎯 Hedef: Tüm bileşenlerin test edilmesi

- [x] Bot unit testleri — OCR normalizasyon (30+ ülke plaka formatı)
- [x] Bot unit testleri — Upload modülü (path oluşturma, resim optimizasyon)
- [x] Web panel build kontrolü (Next.js production build başarılı)
- [x] Uçtan uca test: Telegram'dan fotoğraf at → Web'den ara → Sonucu gör
- [ ] Hata senaryoları testi (ağ kesintisi, geçersiz fotoğraf, timeout) — opsiyonel
- [ ] Performans testi (50+ eşzamanlı session) — opsiyonel

**Git Checkpoint:**
```bash
git add . && git commit -m "test: add unit and integration tests"
```

---

## Phase 10 — Deploy ve Canlıya Alma
> 🎯 Hedef: Sistemi production'a taşıma

- [ ] Bot deploy stratejisi seç (VPS / Railway / Fly.io)
- [ ] Web panel deploy (Vercel)
- [ ] Environment variable'ları production'a aktar
- [ ] Supabase projesini production mode'a al
- [ ] Domain ve SSL yapılandır (opsiyonel)
- [ ] Monitoring ve logging kur (opsiyonel)
- [ ] Saha ekibi için kullanım kılavuzu hazırla

**Git Checkpoint:**
```bash
git add . && git commit -m "chore: production deployment configuration"
git tag v1.0.0
git push origin main --tags
```

---

## 🏁 Tamamlanma Kriterleri

| Kriter                                              | Durum |
| --------------------------------------------------- | ----- |
| Saha çalışanı Telegram'dan fotoğraf atabiliyor      | ✅     |
| Bot plakayı OCR ile okuyabiliyor                    | ✅     |
| Peş peşe atılan fotoğraflar aynı araçta gruplanıyor | ✅     |
| Ofis çalışanı web panelden plaka arayabiliyor       | ✅     |
| Bulanık arama çalışıyor (eksik karakter ile)        | ✅     |
| Fotoğraflar galeri görünümünde açılıyor             | ✅     |
