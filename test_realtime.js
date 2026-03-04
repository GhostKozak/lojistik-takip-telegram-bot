const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jhvqyggoqrumxwskzmkk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpodnF5Z2dvcXJ1bXh3c2t6bWtrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ3NDk3NiwiZXhwIjoyMDg4MDUwOTc2fQ.qLiwoWdm9FuEXDJq0LY5mdWmr2RzX4OcABB0-4Fkg1Y';
const supabase = createClient(supabaseUrl, supabaseKey);

async function simulate() {
    console.log('🚀 Simülasyon başlıyor...');

    // 1. Yeni bir session ekle
    const plate = 'REALTIME_' + Math.floor(Math.random() * 1000);
    const { data: session, error: sErr } = await supabase
        .from('vehicle_sessions')
        .insert({
            plate_number: plate,
            user_id: 1,
            status: 'open',
            confidence: 0.95
        })
        .select()
        .single();

    if (sErr) {
        console.error('Session error:', sErr);
        return;
    }
    console.log('✅ Yeni session eklendi:', plate);

    // 2. Bir fotoğraf ekle
    const { error: pErr } = await supabase
        .from('photos')
        .insert({
            session_id: session.id,
            storage_path: 'test/realtime.jpg',
            public_url: 'https://via.placeholder.com/300',
            confidence: 0.99
        });

    if (pErr) {
        console.error('Photo error:', pErr);
    } else {
        console.log('✅ Fotoğraf eklendi.');
    }
}

simulate();
