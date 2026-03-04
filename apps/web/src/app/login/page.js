'use client';

import { loginAction } from './actions';
import { useActionState } from 'react';
import styles from './login.module.css';

export default function LoginPage() {
    const [state, formAction, isPending] = useActionState(loginAction, null);

    return (
        <div className={styles.container}>
            <div className={styles.loginBox}>
                <div className={styles.logo}>
                    <div className={styles.iconWrapper}>
                        <span role="img" aria-label="truck">🚚</span>
                    </div>
                    <h1>Lojistik Takip</h1>
                    <p>Yönetim Paneli Girişi</p>
                </div>

                <form action={formAction} className={styles.form}>
                    <div className={styles.inputGroup}>
                        <label htmlFor="email">E-posta Adresi</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            placeholder="admin@lojistiktakip.com"
                            className={styles.input}
                        />
                    </div>
                    <div className={styles.inputGroup}>
                        <label htmlFor="password">Şifre</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            placeholder="••••••••"
                            className={styles.input}
                        />
                    </div>

                    {state?.error && (
                        <div className={styles.errorBox}>
                            <span className={styles.errorIcon}>⚠️</span>
                            {state.error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className={styles.submitBtn}
                        disabled={isPending}
                    >
                        {isPending ? (
                            <>
                                <span className={styles.spinner}></span>
                                Giriş Yapılıyor...
                            </>
                        ) : 'Giriş Yap'}
                    </button>
                </form>
            </div>
        </div>
    );
}
