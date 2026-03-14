#!/usr/bin/env node

/**
 * Fotoğraf Arşivleme Cron Script'i
 * 
 * 6 aydan eski + kapalı session'lara ait fotoğrafları:
 *   1. Supabase Storage'dan siler
 *   2. DB'deki kaydı "archived:" olarak günceller (metadata korunur)
 * 
 * Kullanım:
 *   node scripts/cleanup-photos.js                    # Varsayılan: 180 gün
 *   node scripts/cleanup-photos.js --retention 90     # 90 gün
 *   node scripts/cleanup-photos.js --dry-run          # Simülasyon (silmez)
 *   node scripts/cleanup-photos.js --batch-size 50    # Batch boyutu
 * 
 * Cron kurulumu (sistem crontab):
 *   # Her Pazar gece 03:00'te çalıştır
 *   0 3 * * 0 cd /path/to/apps/bot && node scripts/cleanup-photos.js >> /var/log/photo-cleanup.log 2>&1
 * 
 * Veya Node.js ile periyodik:
 *   node scripts/cleanup-photos.js --schedule
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// =============================================
// Yapılandırma
// =============================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'vehicle-photos';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_URL ve SUPABASE_SERVICE_KEY gerekli!');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
});

// =============================================
// CLI Argümanları
// =============================================
const args = process.argv.slice(2);

function getArg(name, defaultValue) {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1) return defaultValue;
    if (typeof defaultValue === 'boolean') return true;
    return args[idx + 1] || defaultValue;
}

const RETENTION_DAYS = parseInt(getArg('retention', '180'));
const BATCH_SIZE = parseInt(getArg('batch-size', '100'));
const DRY_RUN = getArg('dry-run', false);
const SCHEDULE_MODE = getArg('schedule', false);
const SCHEDULE_INTERVAL_H = parseInt(getArg('interval', '168')); // 168h = 1 hafta

// =============================================
// Ana Temizleme Fonksiyonu
// =============================================

/**
 * Arşiv adaylarını bul, Storage'dan sil, DB'de güncelle.
 * @returns {{ processed: number, deleted: number, errors: number, freedBytes: string }}
 */
async function cleanupOldPhotos() {
    const startTime = Date.now();

    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  🗑️  Fotoğraf Arşivleme Script\'i                 ║');
    console.log(`║  📅 Retention: ${String(RETENTION_DAYS).padEnd(5)} gün                       ║`);
    console.log(`║  📦 Batch: ${String(BATCH_SIZE).padEnd(5)} fotoğraf                    ║`);
    console.log(`║  ${DRY_RUN ? '🔍 Mod: DRY-RUN (simülasyon)' : '🗑️  Mod: PRODUCTION (siliniyor!)'}${''.padEnd(DRY_RUN ? 2 : 0)}            ║`);
    console.log('╚══════════════════════════════════════════════════╝');
    console.log();

    // ---- 1. Arşiv adaylarını bul ----
    let candidates;

    // Önce RPC fonksiyonunu dene (migration uygulanmışsa)
    const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_archivable_photos', { retention_days: RETENTION_DAYS });

    if (!rpcError && rpcData) {
        candidates = rpcData;
    } else {
        // RPC yoksa fallback — doğrudan sorgu
        console.log('[CLEANUP] ℹ️  RPC bulunamadı, fallback sorgu kullanılıyor...');
        const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('photos')
            .select('id, session_id, storage_path, uploaded_at, vehicle_sessions!inner(plate_number, status)')
            .eq('vehicle_sessions.status', 'closed')
            .lt('uploaded_at', cutoffDate)
            .not('storage_path', 'like', 'archived:%')
            .order('uploaded_at', { ascending: true })
            .limit(BATCH_SIZE);

        if (error) {
            console.error(`[CLEANUP] ❌ Sorgu hatası: ${error.message}`);
            return { processed: 0, deleted: 0, errors: 1, freedBytes: '0' };
        }

        candidates = (data || []).map(p => ({
            photo_id: p.id,
            session_id: p.session_id,
            storage_path: p.storage_path,
            plate_number: p.vehicle_sessions?.plate_number || 'unknown',
            uploaded_at: p.uploaded_at,
        }));
    }

    // Batch limiti uygula
    const batch = candidates.slice(0, BATCH_SIZE);

    if (batch.length === 0) {
        console.log('[CLEANUP] ✅ Arşivlenecek fotoğraf yok. Her şey güncel!');
        return { processed: 0, deleted: 0, errors: 0, freedBytes: '0' };
    }

    console.log(`[CLEANUP] 📋 ${candidates.length} arşiv adayı bulundu (batch: ${batch.length})`);
    console.log();

    // ---- 2. Plaka bazlı istatistik ----
    const plateStats = {};
    for (const photo of batch) {
        const plate = photo.plate_number || 'unknown';
        plateStats[plate] = (plateStats[plate] || 0) + 1;
    }

    console.log('[CLEANUP] 📊 Plaka dağılımı:');
    for (const [plate, count] of Object.entries(plateStats).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        console.log(`  • ${plate}: ${count} fotoğraf`);
    }
    if (Object.keys(plateStats).length > 10) {
        console.log(`  ... ve ${Object.keys(plateStats).length - 10} plaka daha`);
    }
    console.log();

    if (DRY_RUN) {
        console.log('[DRY-RUN] 🔍 Simülasyon modu — hiçbir şey silinmedi.');
        console.log(`[DRY-RUN] ${batch.length} fotoğraf arşivlenecekti.`);
        return { processed: batch.length, deleted: 0, errors: 0, freedBytes: '~' };
    }

    // ---- 3. Storage'dan sil + DB'de güncelle ----
    let deleted = 0;
    let errors = 0;
    const successIds = [];

    // Storage dosyalarını toplu sil (Supabase max 1000 per request)
    const storagePaths = batch
        .map(p => p.storage_path)
        .filter(p => p && !p.startsWith('pending/') && !p.startsWith('archived:'));

    if (storagePaths.length > 0) {
        console.log(`[CLEANUP] 🗑️  ${storagePaths.length} dosya Storage'dan siliniyor...`);

        // Supabase Storage toplu silme (batch of 100)
        for (let i = 0; i < storagePaths.length; i += 100) {
            const chunk = storagePaths.slice(i, i + 100);

            const { data: removeData, error: removeError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .remove(chunk);

            if (removeError) {
                console.error(`[CLEANUP] ⚠️  Storage silme hatası (batch ${Math.floor(i / 100) + 1}): ${removeError.message}`);
                errors++;
            } else {
                const removedCount = removeData?.length || chunk.length;
                deleted += removedCount;
                console.log(`[CLEANUP] ✅ ${removedCount} dosya silindi (batch ${Math.floor(i / 100) + 1})`);
            }
        }
    }

    // "pending/" ile başlayan path'ler (Storage'a hiç yüklenmemiş) → doğrudan arşivle
    const pendingPaths = batch.filter(p => p.storage_path?.startsWith('pending/'));
    if (pendingPaths.length > 0) {
        console.log(`[CLEANUP] ℹ️  ${pendingPaths.length} pending kayıt (Storage'da yok) arşivleniyor...`);
    }

    // Tüm batch ID'lerini topla
    const allIds = batch.map(p => p.photo_id);

    // ---- 4. DB'de "arşivlendi" olarak işaretle ----
    // Önce RPC dene
    const { data: markResult, error: markError } = await supabase
        .rpc('mark_photos_archived', { photo_ids: allIds });

    if (markError) {
        // RPC yoksa fallback
        console.log('[CLEANUP] ℹ️  RPC bulunamadı, fallback UPDATE kullanılıyor...');

        for (const photo of batch) {
            const { error: updateError } = await supabase
                .from('photos')
                .update({
                    storage_path: `archived:${photo.storage_path}`,
                    public_url: `archived:${photo.storage_path}`,
                })
                .eq('id', photo.photo_id);

            if (updateError) {
                console.error(`[CLEANUP] ⚠️  DB güncelleme hatası (${photo.photo_id}): ${updateError.message}`);
                errors++;
            } else {
                successIds.push(photo.photo_id);
            }
        }
    } else {
        const affectedCount = markResult || allIds.length;
        successIds.push(...allIds);
        console.log(`[CLEANUP] ✅ ${affectedCount} kayıt DB'de arşivlendi`);
    }

    // ---- 5. Sonuç raporu ----
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`[CLEANUP] 📊 Sonuç Raporu`);
    console.log(`  📋 İşlenen:    ${batch.length} fotoğraf`);
    console.log(`  🗑️  Silinen:    ${deleted} dosya (Storage)`);
    console.log(`  📝 Arşivlenen: ${successIds.length} kayıt (DB)`);
    console.log(`  ⚠️  Hata:       ${errors}`);
    console.log(`  ⏱️  Süre:       ${duration}s`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (candidates.length > BATCH_SIZE) {
        console.log(`\n⚠️  ${candidates.length - BATCH_SIZE} fotoğraf daha arşivlenmeyi bekliyor. Script'i tekrar çalıştırın.`);
    }

    return { processed: batch.length, deleted, errors, freedBytes: '~' };
}

// =============================================
// Çalıştırma Modu
// =============================================

if (SCHEDULE_MODE) {
    // Periyodik mod — kendi içinde schedule yapar
    const intervalMs = SCHEDULE_INTERVAL_H * 60 * 60 * 1000;
    console.log(`[SCHEDULER] ⏰ Her ${SCHEDULE_INTERVAL_H} saatte bir çalışacak (${SCHEDULE_INTERVAL_H}h)`);
    console.log(`[SCHEDULER] İlk çalıştırma şimdi...\n`);

    // İlk çalıştırma
    await cleanupOldPhotos();

    // Periyodik
    setInterval(async () => {
        console.log(`\n[SCHEDULER] ⏰ Zamanlanmış çalıştırma: ${new Date().toISOString()}\n`);
        await cleanupOldPhotos();
    }, intervalMs);
} else {
    // Tek seferlik çalıştırma
    const result = await cleanupOldPhotos();
    process.exit(result.errors > 0 ? 1 : 0);
}
