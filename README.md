# Lojistik Fotoğraf Yönetim Sistemi

Saha çalışanlarının araç plakası, konteyner ve mühür fotoğraflarını **Telegram Bot** üzerinden gönderip, ofis çalışanlarının **Web Paneli** ile hızlıca aramasını sağlayan bir lojistik otomasyon sistemi.

## 🏗️ Mimari

```
Telegram Bot (Node.js + grammY)  →  Supabase (PostgreSQL + Storage)  ←  Next.js Web Panel
        ↓                                                                      ↓
   PlateRecognizer.com                                                Fuzzy Search (pg_trgm)
```

> **Not:** Projede ayrıca gelecekte yerel çalışmaya geçiş potansiyeli için bir `Python OCR (YOLOv8 + EasyOCR)` betiği de bulunmaktadır, ancak şu aşamada aktif olarak bulut tabanlı API (PlateRecognizer) kullanılmaktadır.

## 📁 Proje Yapısı

```
lojistik-takip/
├── apps/
│   ├── bot/          # Telegram Bot (Node.js)
│   └── web/          # Web Panel (Next.js 14)
├── supabase/         # Migration dosyaları
├── agents.md         # AI ajanları rol tanımları
└── progress.md       # Görev takip listesi
```

## 🚀 Hızlı Başlangıç

### Gereksinimler

- Node.js 20+
- npm 10+
- Supabase hesabı ([supabase.com](https://supabase.com))
- Telegram Bot Token ([BotFather](https://t.me/BotFather))

### 1. Ortam Değişkenlerini Ayarla

```bash
# Bot
cp apps/bot/.env.example apps/bot/.env
# Web Panel
cp apps/web/.env.local.example apps/web/.env.local
```

Dosyaları düzenleyip kendi değerlerinizi girin.

### 2. Bot'u Çalıştır

```bash
cd apps/bot
npm install
npm run dev
```

### 3. Web Panel'i Çalıştır

```bash
cd apps/web
npm install
npm run dev
```

Tarayıcıda `http://localhost:3000` adresine gidin.

## 📖 Kullanım

### Saha Çalışanı (Telegram)
1. Bot'a `/start` yazarak kaydolun
2. Araç plakasının fotoğrafını gönderin (OCR otomatik okur)
3. Mühür ve konteyner fotoğraflarını peş peşe gönderin
4. `/done` yazarak veya 5 dk bekleyerek oturumu kapatın

### Ofis Çalışanı (Web Panel)
1. Arama çubuğuna plakanın birkaç karakterini yazın
2. Bulanık arama ile eşleşen araçları görün
3. Araç kartına tıklayıp tüm fotoğrafları inceleyin

## 🛠️ Teknolojiler

| Katman  | Teknoloji                        |
| ------- | -------------------------------- |
| Bot     | Node.js 20, grammY, PlateRecognizer.com (Gelecek için YOLOv8 ve EasyOCR kodları dahil) |
| Web     | Next.js 14, React 18             |
| DB      | PostgreSQL 16 (Supabase)         |
| Storage | Supabase Storage                 |
| Search  | pg_trgm (trigram fuzzy)          |

## 📄 Lisans

MIT
