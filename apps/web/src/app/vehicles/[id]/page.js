import { supabase } from '@/lib/supabase';
import VehicleDetail from './VehicleDetail';
import { notFound } from 'next/navigation';

export async function generateMetadata({ params }) {
    const { id } = await params;
    const { data } = await supabase
        .from('vehicle_sessions')
        .select('plate_number')
        .eq('id', id)
        .maybeSingle();

    return {
        title: data ? `${data.plate_number} — Lojistik Takip` : 'Araç Bulunamadı',
    };
}

export default async function VehicleDetailPage({ params }) {
    const { id } = await params;

    // Session bilgisi + kullanıcı + fotoğraflar
    const { data: session, error } = await supabase
        .from('vehicle_sessions')
        .select('*, field_users(full_name, username)')
        .eq('id', id)
        .maybeSingle();

    if (error || !session) {
        notFound();
    }

    // Fotoğrafları ayrı çek (tam veri)
    const { data: photos } = await supabase
        .from('photos')
        .select('*')
        .eq('session_id', id)
        .order('uploaded_at', { ascending: true });

    return <VehicleDetail session={session} photos={photos ?? []} />;
}
