'use server'

import { createClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

/**
 * Update session notes securely via a Server Action
 * This prevents clients from directly making unvalidated database updates.
 */
export async function updateSessionNotes(sessionId, notes) {
    if (!sessionId) {
        return { error: 'Oturum ID eksik.' };
    }

    const supabase = await createClient();

    // 1. Yetki Kontrolü: Server tarafında session'ı ve yetkiyi kontrol et
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return { error: 'Yetkisiz işlem. Lütfen giriş yapın.' };
    }

    // 2. Güvenli Güncelleme
    const { error: updateError } = await supabase
        .from('vehicle_sessions')
        .update({ notes: notes || '' })
        .eq('id', sessionId);

    if (updateError) {
        console.error('Not güncellenemedi:', updateError.message);
        return { error: 'Not güncellenemedi.' };
    }

    // Seçilen yol için önbelleği (cache) temizle -> sayfayı güncel verilerle sarmala
    revalidatePath(`/vehicles/${sessionId}`);
    
    return { success: true };
}
