# 📋 Proje İlerleme Takibi — Lojistik Fotoğraf Yönetim Sistemi

> Son güncelleme: 2026-03-02

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

## Phase 3 — OCR Entegrasyonu
> 🎯 Hedef: Fotoğraftan Türk plaka numarası okuma

- [ ] `src/ocr.js` — Tesseract.js worker setup
- [ ] Türkçe dil paketini (`tur`) yapılandır
- [ ] Plaka regex pattern'i tanımla (`/^\d{2}\s?[A-Z]{1,3}\s?\d{2,4}$/`)
- [ ] `recognizePlate(imageBuffer)` fonksiyonunu yaz
- [ ] OCR güven eşiği (confidence threshold) ayarla
- [ ] 5+ örnek plaka fotoğrafı ile test et
- [ ] Edge case'leri ele al (bulanık, eğik, gece çekimi)

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(bot): add tesseract OCR plate recognition"
```

---

## Phase 4 — Session Yönetimi
> 🎯 Hedef: Peş peşe atılan fotoğrafları aynı araca gruplama

- [ ] `src/session.js` — `SessionState` class
- [ ] In-memory session map (`activeSessions`)
- [ ] 5 dakika timeout mekanizması
- [ ] Session açma (OCR başarılı → yeni session)
- [ ] Session'a fotoğraf ekleme (açık session varsa)
- [ ] `/done` komutu — erken session kapatma
- [ ] `/durum` komutu — aktif session bilgisi
- [ ] Manuel plaka girişi (OCR başarısız olduğunda)
- [ ] Bot restart recovery (DB'deki açık session'ları yükle)

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(bot): implement session-based photo grouping"
```

---

## Phase 5 — Dosya Yükleme Pipeline
> 🎯 Hedef: Telegram fotoğraflarının Supabase Storage'a aktarılması

- [ ] Telegram file download → Buffer dönüşümü
- [ ] Supabase Storage'a upload fonksiyonu
- [ ] Dosya isimlendirme: `{plate}/{timestamp}_{type}.jpg`
- [ ] Public URL oluşturma
- [ ] Upload hatalarında retry mekanizması
- [ ] Dosya boyutu limiti kontrolü

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(bot): add file upload pipeline to supabase storage"
```

---

## Phase 6 — Web Panel Temeli
> 🎯 Hedef: Next.js iskeletinin hazırlanması

- [ ] `apps/web/` dizininde Next.js 14 projesi oluştur
  ```bash
  cd apps/web && npx -y create-next-app@latest ./ --app --src-dir --no-tailwind
  ```
- [ ] Supabase JS client kur (`src/lib/supabase.js`)
- [ ] Root layout ve global stiller
- [ ] Dashboard sayfa iskeleti (`src/app/page.jsx`)

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(web): scaffold next.js dashboard"
```

---

## Phase 7 — Arama ve Liste
> 🎯 Hedef: Fuzzy search ile plaka arama ve sonuç listeleme

- [ ] `SearchBar.jsx` — Debounced input (300ms)
- [ ] `/api/search/route.js` — Supabase `similarity()` sorgusu
- [ ] `VehicleCard.jsx` — Araç özet kartı
- [ ] `StatusBadge.jsx` — Açık/Kapalı session göstergesi
- [ ] Sonuçları grid layout ile göster
- [ ] Boş durum (empty state) tasarımı
- [ ] Yüklenme (loading) skeleton'ları

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(web): add fuzzy search and vehicle cards"
```

---

## Phase 8 — Detay Sayfası ve Galeri
> 🎯 Hedef: Araç detayı ve fotoğraf galerisi

- [ ] `vehicles/[id]/page.jsx` — Araç detay sayfası
- [ ] `PhotoGallery.jsx` — Thumbnail grid + Lightbox
- [ ] Fotoğraf tipi etiketleri (plaka / mühür / konteyner)
- [ ] Fotoğraf indirme butonu
- [ ] Responsive tasarım (mobil uyumlu)

**Git Checkpoint:**
```bash
git add . && git commit -m "feat(web): add vehicle detail page with photo gallery"
```

---

## Phase 9 — Test ve Kalite Kontrol
> 🎯 Hedef: Tüm bileşenlerin test edilmesi

- [ ] Bot unit testleri (OCR, session)
- [ ] Web API route testleri (search)
- [ ] Uçtan uca test: Telegram'dan fotoğraf at → Web'den ara → Sonucu gör
- [ ] Hata senaryoları testi (ağ kesintisi, geçersiz fotoğraf, timeout)
- [ ] Performans testi (50+ eşzamanlı session)

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
| Saha çalışanı Telegram'dan fotoğraf atabiliyor      | ⬜     |
| Bot plakayı OCR ile okuyabiliyor                    | ⬜     |
| Peş peşe atılan fotoğraflar aynı araçta gruplanıyor | ⬜     |
| Ofis çalışanı web panelden plaka arayabiliyor       | ⬜     |
| Bulanık arama çalışıyor (eksik karakter ile)        | ⬜     |
| Fotoğraflar galeri görünümünde açılıyor             | ⬜     |
