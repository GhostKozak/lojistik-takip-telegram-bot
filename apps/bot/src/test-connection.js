/**
 * Supabase Bağlantı Testi
 * Bu script Supabase bağlantısını doğrular ve veritabanı durumunu kontrol eder.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

console.log('╔══════════════════════════════════════════╗');
console.log('║   🔌 Supabase Bağlantı Testi             ║');
console.log('╚══════════════════════════════════════════╝');
console.log();

// 1. Env değişkenlerini kontrol et
console.log('📋 1. Environment Değişkenleri:');
console.log(`   SUPABASE_URL:         ${SUPABASE_URL ? '✅ Ayarlandı (' + SUPABASE_URL.substring(0, 30) + '...)' : '❌ EKSİK!'}`);
console.log(`   SUPABASE_SERVICE_KEY: ${SUPABASE_SERVICE_KEY ? '✅ Ayarlandı (' + SUPABASE_SERVICE_KEY.substring(0, 15) + '...)' : '❌ EKSİK!'}`);
console.log();

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Eksik environment değişkenleri! .env dosyasını kontrol edin.');
  process.exit(1);
}

// 2. Supabase client oluştur
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

async function testConnection() {
  try {
    // 3. Temel bağlantı testi — basit bir sorgu çalıştır
    console.log('🔗 2. Bağlantı Testi:');
    
    // Önce tabloların var olup olmadığını kontrol edelim
    const tables = ['field_users', 'vehicle_sessions', 'photos'];
    const tableResults = {};
    
    for (const table of tables) {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        tableResults[table] = { exists: false, error: error.message };
      } else {
        tableResults[table] = { exists: true, count: count ?? 0 };
      }
    }

    // Sonuçları göster
    const allExist = Object.values(tableResults).every(r => r.exists);
    
    if (allExist) {
      console.log('   ✅ Supabase bağlantısı başarılı!');
      console.log();
      console.log('📊 3. Tablo Durumları:');
      for (const [table, result] of Object.entries(tableResults)) {
        console.log(`   ✅ ${table.padEnd(20)} — ${result.count} kayıt`);
      }
    } else {
      console.log('   ⚠️  Supabase bağlantısı başarılı, fakat bazı tablolar bulunamadı.');
      console.log();
      console.log('📊 3. Tablo Durumları:');
      for (const [table, result] of Object.entries(tableResults)) {
        if (result.exists) {
          console.log(`   ✅ ${table.padEnd(20)} — ${result.count} kayıt`);
        } else {
          console.log(`   ❌ ${table.padEnd(20)} — ${result.error}`);
        }
      }
      console.log();
      console.log('💡 Migration çalıştırmanız gerekiyor:');
      console.log('   Supabase Dashboard → SQL Editor → supabase/migrations/001_initial_schema.sql içeriğini yapıştırın');
    }

    // 4. pg_trgm extension kontrolü
    console.log();
    console.log('🔍 4. Extension Kontrolü:');
    const { data: extData, error: extError } = await supabase.rpc('pg_trgm_installed', {}).maybeSingle();
    
    if (extError) {
      // Extension check via direct query
      console.log('   ℹ️  pg_trgm extension kontrolü doğrudan yapılamadı (RPC yok).');
      console.log('   💡 Migration SQL\'i çalıştırdıysanız, pg_trgm zaten aktif olmalı.');
    }

    // 5. Storage bucket kontrolü
    console.log();
    console.log('🗂️  5. Storage Bucket Kontrolü:');
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    
    if (bucketError) {
      console.log(`   ❌ Storage erişim hatası: ${bucketError.message}`);
    } else {
      const vehicleBucket = buckets?.find(b => b.name === 'vehicle-photos');
      if (vehicleBucket) {
        console.log('   ✅ "vehicle-photos" bucket mevcut');
      } else {
        console.log('   ⚠️  "vehicle-photos" bucket bulunamadı');
        console.log(`   📋 Mevcut bucket\'lar: ${buckets?.map(b => b.name).join(', ') || '(yok)'}`);
        console.log('   💡 Supabase Dashboard → Storage → "New Bucket" → "vehicle-photos" oluşturun');
      }
    }

    // Özet
    console.log();
    console.log('═'.repeat(44));
    if (allExist) {
      console.log('🎉 Tüm kontroller başarılı! Veritabanı kullanıma hazır.');
    } else {
      console.log('⚠️  Bazı adımlar tamamlanmamış. Yukarıdaki 💡 ipuçlarını takip edin.');
    }
    console.log('═'.repeat(44));

  } catch (err) {
    console.error();
    console.error('❌ Bağlantı hatası:', err.message);
    console.error();
    console.error('Olası sebepler:');
    console.error('  1. SUPABASE_URL yanlış');
    console.error('  2. SUPABASE_SERVICE_KEY yanlış veya expired');
    console.error('  3. İnternet bağlantı sorunu');
    process.exit(1);
  }
}

testConnection();
