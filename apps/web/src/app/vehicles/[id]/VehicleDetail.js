'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import JSZip from 'jszip';
import { supabase } from '@/lib/supabase';
import styles from './VehicleDetail.module.css';

export default function VehicleDetail({ session: initialSession, photos: initialPhotos }) {
    const [session, setSession] = useState(initialSession);
    const [photos, setPhotos] = useState(initialPhotos);
    const [lightboxIndex, setLightboxIndex] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [notes, setNotes] = useState(session.notes || '');
    const [isSaving, setIsSaving] = useState(false);
    const [newUpdateAnim, setNewUpdateAnim] = useState(false);

    const userName = session.field_users?.full_name || 'Bilinmeyen';

    const formatDate = useCallback((dateStr) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('tr-TR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }, []);

    const openLightbox = (index) => setLightboxIndex(index);
    const closeLightbox = () => setLightboxIndex(null);
    const prevPhoto = () => setLightboxIndex((i) => (i > 0 ? i - 1 : photos.length - 1));
    const nextPhoto = () => setLightboxIndex((i) => (i < photos.length - 1 ? i + 1 : 0));

    // Keyboard navigation
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') prevPhoto();
        if (e.key === 'ArrowRight') nextPhoto();
    }, [photos.length]);

    // Save Notes (Debounced)
    useEffect(() => {
        if (notes === (session.notes || '')) return;

        const timer = setTimeout(async () => {
            setIsSaving(true);
            try {
                const { error } = await supabase
                    .from('vehicle_sessions')
                    .update({ notes: notes.trim() })
                    .eq('id', session.id);

                if (error) throw error;
            } catch (err) {
                console.error('Not kaydetme hatası:', err);
            } finally {
                setIsSaving(false);
            }
        }, 1000);

        return () => clearTimeout(timer);
    }, [notes, session.id, session.notes]);

    // Supabase Real-time Subscription
    useEffect(() => {
        const channel = supabase
            .channel(`vehicle_detail_${session.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'photos', filter: `session_id=eq.${session.id}` }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    setPhotos(prev => [...prev, payload.new]);
                    setNewUpdateAnim(true);
                    setTimeout(() => setNewUpdateAnim(false), 3000);
                } else if (payload.eventType === 'UPDATE') {
                    setPhotos(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
                } else if (payload.eventType === 'DELETE') {
                    setPhotos(prev => prev.filter(p => p.id !== payload.old.id));
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vehicle_sessions', filter: `id=eq.${session.id}` }, (payload) => {
                // Use functional update to preserve joined data like field_users
                setSession(prev => ({ ...prev, ...payload.new }));
                if (payload.new.status === 'closed' && session.status !== 'closed') {
                    setNewUpdateAnim(true);
                    setTimeout(() => setNewUpdateAnim(false), 3000);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [session.id, session.status]);

    // Bulk Download
    const downloadAll = async () => {
        if (photos.length === 0 || downloading) return;
        setDownloading(true);

        try {
            const zip = new JSZip();
            const folder = zip.folder(`Lojistik_${session.plate_number.replace(/\s+/g, '_')}`);

            // Tüm fotoğrafları indir
            const downloadPromises = photos.map(async (photo, index) => {
                if (photo.public_url.startsWith('pending/')) return;

                try {
                    const response = await fetch(photo.public_url);
                    const blob = await response.blob();

                    // Dosya ismini oluştur (index + tarih)
                    const date = new Date(photo.uploaded_at).toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    const fileName = `${index + 1}_${date}.jpg`;

                    folder.file(fileName, blob);
                } catch (err) {
                    console.error('Fotoğraf indirme hatası:', err);
                }
            });

            await Promise.all(downloadPromises);

            const content = await zip.generateAsync({ type: 'blob' });

            // Link oluştur ve indir
            const url = window.URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${session.plate_number.replace(/\s+/g, '_')}_fotograflar.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            alert('ZIP oluşturulurken hata oluştu.');
            console.error(err);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className={styles.container}>
            {/* Back button */}
            <Link href="/" className={styles.backLink}>
                ← Dashboard'a Dön
            </Link>

            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.plate}>{session.plate_number}</h1>
                    <span className={`${styles.status} ${styles[session.status]}`}>
                        <span className={styles.statusDot}></span>
                        {session.status === 'open' ? 'Açık Oturum' : 'Kapalı Oturum'}
                    </span>
                </div>
                <div className={styles.actions}>
                    {newUpdateAnim && (
                        <div className={styles.updateToast} style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--accent-success)', color: 'white', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius)', fontSize: '0.85rem', marginRight: '1rem', animation: 'fadeIn 0.3s' }}>
                            ✨ Yeni güncelleme
                        </div>
                    )}
                    <button
                        className={styles.bulkDownloadBtn}
                        onClick={downloadAll}
                        disabled={downloading || photos.length === 0}
                    >
                        {downloading ? '📦 ZIP Hazırlanıyor...' : '🗂️ Tümünü İndir (ZIP)'}
                    </button>
                </div>
            </div>

            {/* Info Cards */}
            <div className={styles.infoGrid}>
                <div className={styles.infoCard}>
                    <span className={styles.infoIcon}>👤</span>
                    <div>
                        <div className={styles.infoLabel}>Kullanıcı</div>
                        <div className={styles.infoValue}>{userName}</div>
                    </div>
                </div>
                <div className={styles.infoCard}>
                    <span className={styles.infoIcon}>📸</span>
                    <div>
                        <div className={styles.infoLabel}>Fotoğraf</div>
                        <div className={styles.infoValue}>{photos.length} adet</div>
                    </div>
                </div>
                <div className={styles.infoCard}>
                    <span className={styles.infoIcon}>📅</span>
                    <div>
                        <div className={styles.infoLabel}>Açılış</div>
                        <div className={styles.infoValue}>{formatDate(session.opened_at)}</div>
                    </div>
                </div>
                {session.closed_at && (
                    <div className={styles.infoCard}>
                        <span className={styles.infoIcon}>🔒</span>
                        <div>
                            <div className={styles.infoLabel}>Kapanış</div>
                            <div className={styles.infoValue}>{formatDate(session.closed_at)}</div>
                        </div>
                    </div>
                )}
                {session.confidence > 0 && (
                    <div className={styles.infoCard}>
                        <span className={styles.infoIcon}>🎯</span>
                        <div>
                            <div className={styles.infoLabel}>OCR Güven</div>
                            <div className={styles.infoValue}>%{Math.round(session.confidence * 100)}</div>
                        </div>
                    </div>
                )}
                {session.plate_raw && session.plate_raw !== session.plate_number && (
                    <div className={styles.infoCard}>
                        <span className={styles.infoIcon}>🔤</span>
                        <div>
                            <div className={styles.infoLabel}>OCR Ham</div>
                            <div className={styles.infoValue}>{session.plate_raw}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Notes Section */}
            <div className={styles.notesSection}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.galleryTitle}>📝 Notlar / Açıklama</h2>
                    {isSaving && <span className={styles.saveIndicator}>🔄 Kaydediliyor...</span>}
                </div>
                <textarea
                    className={styles.notesTextarea}
                    placeholder="Bu oturum hakkında not girin... (Otomatik kaydedilir)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>

            {/* Photo Gallery */}
            <div className={styles.gallerySection}>
                <h2 className={styles.galleryTitle}>📷 Fotoğraflar</h2>

                {photos.length === 0 ? (
                    <div className={styles.emptyGallery}>
                        <div className={styles.emptyIcon}>📭</div>
                        <p>Bu oturuma ait fotoğraf bulunamadı.</p>
                    </div>
                ) : (
                    <div className={styles.photoGrid}>
                        {photos.map((photo, index) => {
                            const isPending = photo.public_url?.startsWith('pending/');
                            return (
                                <div
                                    key={photo.id}
                                    className={styles.photoCard}
                                    onClick={() => !isPending && openLightbox(index)}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Fotoğraf ${index + 1}`}
                                >
                                    {isPending ? (
                                        <div className={styles.pendingThumb}>
                                            <span>⏳</span>
                                            <small>Yükleniyor</small>
                                        </div>
                                    ) : (
                                        <img
                                            src={photo.public_url}
                                            alt={`Fotoğraf ${index + 1}`}
                                            className={styles.photoThumb}
                                            loading="lazy"
                                        />
                                    )}
                                    <div className={styles.photoMeta}>
                                        <span className={styles.photoIndex}>#{index + 1}</span>
                                        <span className={styles.photoTime}>
                                            {formatDate(photo.uploaded_at)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Lightbox */}
            {lightboxIndex !== null && photos[lightboxIndex] && (
                <div
                    className={styles.lightbox}
                    onClick={closeLightbox}
                    onKeyDown={handleKeyDown}
                    tabIndex={0}
                    role="dialog"
                    aria-label="Fotoğraf görüntüleyici"
                >
                    <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.lightboxClose} onClick={closeLightbox} aria-label="Kapat">✕</button>

                        <button className={styles.lightboxNav + ' ' + styles.lightboxPrev} onClick={prevPhoto} aria-label="Önceki">
                            ‹
                        </button>

                        <img
                            src={photos[lightboxIndex].public_url}
                            alt={`Fotoğraf ${lightboxIndex + 1}`}
                            className={styles.lightboxImage}
                        />

                        <button className={styles.lightboxNav + ' ' + styles.lightboxNext} onClick={nextPhoto} aria-label="Sonraki">
                            ›
                        </button>

                        <div className={styles.lightboxInfo}>
                            <span>{lightboxIndex + 1} / {photos.length}</span>
                            <a
                                href={photos[lightboxIndex].public_url}
                                download
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.downloadBtn}
                                onClick={(e) => e.stopPropagation()}
                            >
                                📥 İndir
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
