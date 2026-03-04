'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

/**
 * Dashboard Client Component
 * Stats kartları, arama ve araç listesi
 */
const ITEMS_PER_PAGE = 12;

export default function Dashboard({ initialStats, initialSessions }) {
    const [stats, setStats] = useState(initialStats);
    const [sessions, setSessions] = useState(initialSessions);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [dateMode, setDateMode] = useState('range'); // 'range' or 'single'
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(initialSessions.length === ITEMS_PER_PAGE);
    const [lastUpdated, setLastUpdated] = useState(Date.now());
    const [newUpdateAnim, setNewUpdateAnim] = useState(false);

    // ---- Fetch Data Function (First Page or Refresh) ----
    const refreshData = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        try {
            // Stats
            const [{ count: totalSessions }, { count: openSessions }, { count: totalPhotos }, { count: totalUsers }] = await Promise.all([
                supabase.from('vehicle_sessions').select('*', { count: 'exact', head: true }),
                supabase.from('vehicle_sessions').select('*', { count: 'exact', head: true }).eq('status', 'open'),
                supabase.from('photos').select('*', { count: 'exact', head: true }),
                supabase.from('field_users').select('*', { count: 'exact', head: true }),
            ]);

            setStats({
                totalSessions: totalSessions ?? 0,
                openSessions: openSessions ?? 0,
                totalPhotos: totalPhotos ?? 0,
                totalUsers: totalUsers ?? 0,
            });

            // Sessions
            let query = supabase
                .from('vehicle_sessions')
                .select('*, field_users(full_name, username), photos(count)');

            if (searchQuery.trim()) {
                query = query.ilike('plate_number', `%${searchQuery.trim()}%`);
            }

            if (statusFilter !== 'all') {
                query = query.eq('status', statusFilter);
            }

            if (dateRange.start) {
                if (dateMode === 'single') {
                    query = query.gte('opened_at', `${dateRange.start}T00:00:00`)
                        .lte('opened_at', `${dateRange.start}T23:59:59`);
                } else {
                    query = query.gte('opened_at', `${dateRange.start}T00:00:00`);
                }
            }
            if (dateMode === 'range' && dateRange.end) {
                query = query.lte('opened_at', `${dateRange.end}T23:59:59`);
            }

            const { data, error } = await query
                .order('opened_at', { ascending: false })
                .range(0, ITEMS_PER_PAGE - 1);

            if (!error && data) {
                setSessions(data);
                setHasMore(data.length === ITEMS_PER_PAGE);
                setPage(1);

                if (isBackground) {
                    setNewUpdateAnim(true);
                    setTimeout(() => setNewUpdateAnim(false), 3000);
                }
            }
        } catch (err) {
            console.error('Veri yenileme hatası:', err.message);
        } finally {
            if (!isBackground) setLoading(false);
        }
    }, [searchQuery, statusFilter, dateRange]);

    // ---- Load More Function ----
    const loadMore = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);

        try {
            const from = page * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            let query = supabase
                .from('vehicle_sessions')
                .select('*, field_users(full_name, username), photos(count)');

            if (searchQuery.trim()) {
                query = query.ilike('plate_number', `%${searchQuery.trim()}%`);
            }

            if (statusFilter !== 'all') {
                query = query.eq('status', statusFilter);
            }

            if (dateRange.start) {
                if (dateMode === 'single') {
                    query = query.gte('opened_at', `${dateRange.start}T00:00:00`)
                        .lte('opened_at', `${dateRange.start}T23:59:59`);
                } else {
                    query = query.gte('opened_at', `${dateRange.start}T00:00:00`);
                }
            }
            if (dateMode === 'range' && dateRange.end) {
                query = query.lte('opened_at', `${dateRange.end}T23:59:59`);
            }

            const { data, error } = await query
                .order('opened_at', { ascending: false })
                .range(from, to);

            if (!error && data) {
                if (data.length > 0) {
                    setSessions(prev => [...prev, ...data]);
                    setPage(prev => prev + 1);
                }
                setHasMore(data.length === ITEMS_PER_PAGE);
            }
        } catch (err) {
            console.error('Daha fazla yükleme hatası:', err.message);
        } finally {
            setLoadingMore(false);
        }
    };

    // ---- Debounced Search + Status Filter ----
    useEffect(() => {
        // İlk yüklemede ve sadece filtre/arama/tarih değiştiğinde çalışır
        if (!searchQuery.trim() && statusFilter === 'all' && !dateRange.start && !dateRange.end) {
            // Başlangıca dön
            setSessions(initialSessions);
            setStats(initialStats);
            return;
        }

        const timer = setTimeout(() => {
            refreshData();
        }, searchQuery.trim() ? 300 : 0);

        return () => clearTimeout(timer);
    }, [searchQuery, statusFilter, dateRange, dateMode, initialSessions, initialStats, refreshData]);

    // ---- Realtime Subscription ----
    useEffect(() => {
        const channel = supabase
            .channel('dashboard_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_sessions' }, () => {
                refreshData(true);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, () => {
                refreshData(true);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [refreshData]);

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
                <div className="search-row">
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
                    <div className="date-filters">
                        <button
                            className={`date-mode-toggle ${dateMode === 'single' ? 'active' : ''}`}
                            onClick={() => setDateMode(prev => prev === 'range' ? 'single' : 'range')}
                            title={dateMode === 'range' ? 'Tek güne geç' : 'Aralığa geç'}
                        >
                            {dateMode === 'range' ? '📅 Aralık' : '📌 Tek Gün'}
                        </button>

                        <div className="date-input-group">
                            <label htmlFor="date-start">{dateMode === 'range' ? 'Başlangıç:' : 'Tarih:'}</label>
                            <input
                                type="date"
                                id="date-start"
                                className="date-input"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            />
                        </div>

                        {dateMode === 'range' && (
                            <div className="date-input-group">
                                <label htmlFor="date-end">Bitiş:</label>
                                <input
                                    type="date"
                                    id="date-end"
                                    className="date-input"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                />
                            </div>
                        )}

                        {(dateRange.start || dateRange.end) && (
                            <button
                                className="clear-date-btn"
                                onClick={() => setDateRange({ start: '', end: '' })}
                                title="Tarih filtresini temizle"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ---- Realtime Notification Toast ---- */}
            {newUpdateAnim && (
                <div className="realtime-toast">
                    <span className="toast-icon">✨</span>
                    <span className="toast-text">Yeni bir kayıt veya fotoğraf güncellendi</span>
                </div>
            )}

            {/* ---- Filter Tabs ---- */}
            <div className="filter-tabs">
                <button
                    className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('all')}
                >
                    📋 Tümü
                </button>
                <button
                    className={`filter-tab ${statusFilter === 'open' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('open')}
                >
                    🟢 Açık
                </button>
                <button
                    className={`filter-tab ${statusFilter === 'closed' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('closed')}
                >
                    🔒 Kapalı
                </button>
            </div>

            {/* ---- Session List ---- */}
            <div className="vehicles-section">
                <div className="section-header">
                    <h1 className="section-title">
                        {searchQuery ? '🔎 Arama Sonuçları' : statusFilter === 'open' ? '🟢 Açık Oturumlar' : statusFilter === 'closed' ? '🔒 Kapalı Oturumlar' : '🕐 Son Kayıtlar'}
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

                {/* ---- Load More ---- */}
                {hasMore && sessions.length >= ITEMS_PER_PAGE && (
                    <div className="load-more-section">
                        <button
                            className={`load-more-btn ${loadingMore ? 'loading' : ''}`}
                            onClick={loadMore}
                            disabled={loadingMore}
                        >
                            {loadingMore ? (
                                <>
                                    <span className="load-more-spinner"></span>
                                    Yükleniyor...
                                </>
                            ) : (
                                'Daha Fazla Yükle'
                            )}
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
