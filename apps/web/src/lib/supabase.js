import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        '❌ NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local dosyasında tanımlanmalı!'
    );
}

// Client komponentler tarafından kullanılacak standart browser istemcisi
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
