/**
 * Supabase Client — Web Panel
 * Anon key ile read-only erişim (RLS politikalarına tabi)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        '❌ NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local dosyasında tanımlanmalı!'
    );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
});
