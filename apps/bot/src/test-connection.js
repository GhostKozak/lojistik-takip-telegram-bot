/**
 * Supabase Detaylı Tanılama
 * Schema cache ve API key sorunlarını tespit eder
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

console.log('🔍 Supabase Detaylı Tanılama');
console.log('═'.repeat(50));
console.log();

// Key format kontrolü
console.log('📋 API Key Analizi:');
console.log(`   Key uzunluğu: ${SUPABASE_SERVICE_KEY?.length} karakter`);
console.log(`   Key başlangıcı: ${SUPABASE_SERVICE_KEY?.substring(0, 20)}...`);

if (SUPABASE_SERVICE_KEY?.startsWith('eyJ')) {
  console.log('   ✅ JWT format (doğru)');
} else {
  console.log('   ⚠️  JWT formatında DEĞİL!');
  console.log('   💡 Supabase Dashboard → Settings → API → "service_role" key olmalı');
  console.log('   💡 Key "eyJ..." ile başlamalı');
}
console.log();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function diagnose() {
  // Test 1: SELECT
  console.log('🧪 Test 1: SELECT sorgusu');
  try {
    const { data, error, status, statusText } = await supabase
      .from('field_users')
      .select('*')
      .limit(1);

    console.log(`   HTTP Status: ${status} ${statusText}`);
    if (error) {
      console.log(`   ❌ Hata: ${error.message}`);
      console.log(`   Hata kodu: ${error.code}`);
      console.log(`   Detay: ${error.details}`);
      console.log(`   Hint: ${error.hint}`);
    } else {
      console.log(`   ✅ Başarılı! ${data?.length ?? 0} kayıt döndü`);
    }
  } catch (e) {
    console.log(`   ❌ Exception: ${e.message}`);
  }
  console.log();

  // Test 2: INSERT
  console.log('🧪 Test 2: INSERT sorgusu (test kullanıcı)');
  try {
    const { data, error, status } = await supabase
      .from('field_users')
      .insert({
        telegram_id: 9999999999,
        full_name: 'Test Kullanıcı',
        username: 'test_user',
      })
      .select()
      .single();

    console.log(`   HTTP Status: ${status}`);
    if (error) {
      console.log(`   ❌ Hata: ${error.message}`);
      console.log(`   Hata kodu: ${error.code}`);
    } else {
      console.log(`   ✅ Başarılı! Kullanıcı ID: ${data?.id}`);
      // Temizlik - oluşturulan test kaydını sil
      await supabase.from('field_users').delete().eq('telegram_id', 9999999999);
      console.log('   🧹 Test kaydı silindi');
    }
  } catch (e) {
    console.log(`   ❌ Exception: ${e.message}`);
  }
  console.log();

  // Test 3: UPSERT (bot'un kullandığı yöntem)
  console.log('🧪 Test 3: UPSERT sorgusu');
  try {
    const { data, error, status } = await supabase
      .from('field_users')
      .upsert(
        {
          telegram_id: 8888888888,
          full_name: 'Test Upsert',
          username: 'test_upsert',
        },
        { onConflict: 'telegram_id' }
      )
      .select()
      .single();

    console.log(`   HTTP Status: ${status}`);
    if (error) {
      console.log(`   ❌ Hata: ${error.message}`);
      console.log(`   Hata kodu: ${error.code}`);
    } else {
      console.log(`   ✅ Başarılı! Kullanıcı ID: ${data?.id}`);
      // Temizlik
      await supabase.from('field_users').delete().eq('telegram_id', 8888888888);
      console.log('   🧹 Test kaydı silindi');
    }
  } catch (e) {
    console.log(`   ❌ Exception: ${e.message}`);
  }
  console.log();

  // Test 4: REST API doğrudan kontrol
  console.log('🧪 Test 4: REST API doğrudan kontrol');
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/field_users?select=*&limit=1`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    console.log(`   HTTP Status: ${response.status} ${response.statusText}`);
    const body = await response.text();
    console.log(`   Response: ${body.substring(0, 200)}`);
  } catch (e) {
    console.log(`   ❌ Exception: ${e.message}`);
  }

  console.log();
  console.log('═'.repeat(50));
  console.log('📌 Eğer hatalar devam ediyorsa:');
  console.log('   1. Supabase Dashboard → Settings → API bölümünden');
  console.log('      "service_role" key\'i kopyalayın (eyJ... ile başlar)');
  console.log('   2. .env dosyasındaki SUPABASE_SERVICE_KEY değerini güncelleyin');
  console.log('   3. Dashboard → Settings → General → "Reload schema cache" butonuna tıklayın');
}

diagnose();
