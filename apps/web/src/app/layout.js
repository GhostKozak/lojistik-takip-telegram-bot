import './globals.css';
import { createClient } from '@/lib/supabase-server';
import { logoutAction } from './logoutActions';

export const metadata = {
  title: 'Lojistik Takip — Araç Fotoğraf Yönetim Paneli',
  description: 'Saha ekibinden gelen araç plaka, konteyner ve mühür fotoğraflarını arayın ve yönetin. Bulanık plaka araması ile hızlı erişim.',
  keywords: 'lojistik, araç takip, plaka, konteyner, mühür, fotoğraf yönetimi',
};

export default async function RootLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="tr">
      <body>
        <div className="app-container">
          <nav className="navbar">
            <div className="navbar-brand">
              <div className="navbar-brand-icon">🚛</div>
              <div>
                <div className="navbar-brand-text">Lojistik Takip</div>
                <div className="navbar-subtitle">Araç Fotoğraf Yönetimi</div>
              </div>
            </div>
            <div className="navbar-info">
              <span>📡 Dashboard</span>
              {user && (
                <form action={logoutAction} style={{ display: 'inline', marginLeft: '16px' }}>
                  <button type="submit" className="logout-btn">Çıkış Yap 🚪</button>
                </form>
              )}
            </div>
          </nav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
