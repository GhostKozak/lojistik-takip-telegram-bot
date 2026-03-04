'use server'

import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export async function loginAction(prevState, formData) {
    const email = formData.get('email')
    const password = formData.get('password')

    if (!email || !password) {
        return { error: 'E-posta ve şifre zorunludur.' }
    }

    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        if (error.message.includes('Invalid login credentials')) {
            return { error: 'Hatalı e-posta veya şifre!' }
        }
        return { error: `Giriş yapılamadı: ${error.message}` }
    }

    // Başarılı girişte ana sayfaya yönlendir
    redirect('/')
}
