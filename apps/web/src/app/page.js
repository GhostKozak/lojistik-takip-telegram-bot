import { supabase } from '@/lib/supabase';
import Dashboard from './Dashboard';

export default async function HomePage() {
  // Fetch initial stats and recent sessions (server-side)
  let stats = { totalSessions: 0, openSessions: 0, totalPhotos: 0, totalUsers: 0 };
  let recentSessions = [];

  try {
    const [
      { count: totalSessions },
      { count: openSessions },
      { count: totalPhotos },
      { count: totalUsers },
      { data }
    ] = await Promise.all([
      supabase.from('vehicle_sessions').select('*', { count: 'exact', head: true }),
      supabase.from('vehicle_sessions').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('photos').select('*', { count: 'exact', head: true }),
      supabase.from('field_users').select('*', { count: 'exact', head: true }),
      supabase.from('vehicle_sessions')
        .select('*, field_users(full_name, username), photos(count)')
        .order('opened_at', { ascending: false })
        .limit(12)
    ]);

    stats = {
      totalSessions: totalSessions ?? 0,
      openSessions: openSessions ?? 0,
      totalPhotos: totalPhotos ?? 0,
      totalUsers: totalUsers ?? 0,
    };

    recentSessions = data ?? [];
  } catch (err) {
    console.error('Dashboard veri çekme hatası:', err.message);
  }

  return <Dashboard initialStats={stats} initialSessions={recentSessions} />;
}
