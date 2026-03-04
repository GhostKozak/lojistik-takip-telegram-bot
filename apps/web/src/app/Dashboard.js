'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

/**
 * Dashboard Client Component
 * Stats kartları, arama ve araç listesi
 */
export default function Dashboard({ initialStats, initialSessions }) {
    const [stats, setStats] = useState(initialStats);
    const [sessions, setSessions] = useState(initialSessions);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);

    // ---- Debounced Search ----
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSessions(initialSessions);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('vehicle_sessions')
                    .select('*, field_users(full_name, username), photos(count)')
                    .ilike('plate_number', `%${searchQuery.trim()}%`)
                    .order('opened_at', { ascending: false })
                    .limit(20);

                if (!error && data) {
                    setSessions(data);
                }
            } catch (err) {
                console.error('Arama hatası:', err.message);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery, initialSessions]);

    // ---- Format Date ----
    const formatDate = useCallback((dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }, []);

    // ---- Time Ago ----
    const timeAgo = useCallback((dateStr) => {
        if (!dateStr) return '';
        const now = Date.now();
        const then = new Date(dateStr).getTime();
        const diff = now - then;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'az önce';
        if (mins < 60) return `${mins} dk önce`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} saat önce`;
        const days = Math.floor(hours / 24);
        return `${days} gün önce`;
    }, []);

    return (
        <>
            {/* ---- Stats Row ---- */}
            <div className="stats-row">
                <div className="stat-card">
                    <div className="stat-card-label">Toplam Kayıt</div>
                    <div className="stat-card-value accent">{stats.totalSessions}</div>
                    <div className="stat-card-sub">araç oturumu</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-label">Aktif Oturum</div>
                    <div className="stat-card-value" style={{ color: stats.openSessions > 0 ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                        {stats.openSessions}
                    </div>
                    <div className="stat-card-sub">şu an açık</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-label">Toplam Fotoğraf</div>
                    <div className="stat-card-value accent">{stats.totalPhotos}</div>
                    <div className="stat-card-sub">yüklenen</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-label">Saha Kullanıcısı</div>
                    <div className="stat-card-value accent">{stats.totalUsers}</div>
                    <div className="stat-card-sub">kayıtlı</div>
                </div>
            </div>

            {/* ---- Search ---- */}
            <div className="search-section">
                <div className="search-wrapper">
                    <span className="search-icon">🔍</span>
                    <input
                        id="search-plate"
                        type="text"
                        className="search-input"
                        placeholder="Plaka numarası ara... (ör: 34 ABC 1234)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoComplete="off"
                    />
                </div>
            </div>

            {/* ---- Session List ---- */}
            <div className="vehicles-section">
                <div className="section-header">
                    <h1 className="section-title">
                        {searchQuery ? '🔎 Arama Sonuçları' : '🕐 Son Kayıtlar'}
                    </h1>
                    <span className="section-badge">
                        {sessions.length} kayıt
                    </span>
                </div>

                {loading ? (
                    /* Skeleton loading */
                    <div className="vehicles-grid">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="vehicle-card">
                                <div className="skeleton skeleton-title"></div>
                                <div className="skeleton skeleton-text medium"></div>
                                <div className="skeleton skeleton-text short"></div>
                                <div className="skeleton skeleton-text medium"></div>
                            </div>
                        ))}
                    </div>
                ) : sessions.length === 0 ? (
                    /* Empty state */
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            {searchQuery ? '🔍' : '📭'}
                        </div>
                        <div className="empty-state-title">
                            {searchQuery ? 'Sonuç bulunamadı' : 'Henüz kayıt yok'}
                        </div>
                        <div className="empty-state-text">
                            {searchQuery
                                ? `"${searchQuery}" ile eşleşen araç bulunamadı. Farklı bir arama deneyin.`
                                : 'Saha ekibi Telegram botu üzerinden fotoğraf göndermeye başladığında kayıtlar burada görünecek.'}
                        </div>
                    </div>
                ) : (
                    /* Vehicle cards grid */
                    <div className="vehicles-grid">
                        {sessions.map((session) => {
                            const photoCount = session.photos?.[0]?.count ?? 0;
                            const userName = session.field_users?.full_name || 'Bilinmeyen';

                            return (
                                <Link
                                    key={session.id}
                                    href={`/vehicles/${session.id}`}
                                    id={`session-${session.id}`}
                                    className="vehicle-card"
                                    style={{ textDecoration: 'none', color: 'inherit' }}
                                >
                                    <div className="vehicle-card-header">
                                        <span className="vehicle-plate">
                                            {session.plate_number}
                                        </span>
                                        <span className={`vehicle-status ${session.status}`}>
                                            <span className="vehicle-status-dot"></span>
                                            {session.status === 'open' ? 'Açık' : 'Kapalı'}
                                        </span>
                                    </div>
                                    <div className="vehicle-card-meta">
                                        <div className="vehicle-meta-row">
                                            <span className="vehicle-meta-icon">👤</span>
                                            <span className="vehicle-meta-value">{userName}</span>
                                        </div>
                                        <div className="vehicle-meta-row">
                                            <span className="vehicle-meta-icon">📸</span>
                                            <span>{photoCount} fotoğraf</span>
                                        </div>
                                        <div className="vehicle-meta-row">
                                            <span className="vehicle-meta-icon">📅</span>
                                            <span>{formatDate(session.opened_at)}</span>
                                            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {timeAgo(session.opened_at)}
                                            </span>
                                        </div>
                                        {session.confidence != null && session.confidence > 0 && (
                                            <div className="vehicle-meta-row">
                                                <span className="vehicle-meta-icon">🎯</span>
                                                <span>OCR Güven: %{Math.round(session.confidence * 100)}</span>
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}
