'use client';

import Link from 'next/link';
import { useState } from 'react';
import { signInWithGoogle } from '../../lib/supabase/client';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await signInWithGoogle();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo iniciar sesión con Google.',
      );
      setIsLoading(false);
    }
  }

  return (
    <main className="page-container">
      <nav className="breadcrumb">
        <Link href="/" className="back-link">
          ← Volver al inicio
        </Link>
      </nav>

      <section className="hero-card" aria-labelledby="login-title">
        <span className="badge">Cuenta · HU-11</span>
        <h1 id="login-title">Iniciar sesión o registrarte</h1>
        <p className="subtitle">
          Continúa con tu cuenta de Google para acceder a DarkShield.
        </p>

        {errorMessage && (
          <p className="error-summary" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="actions-row">
          <button
            className="btn-primary"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? 'Conectando con Google…' : 'Continuar con Google'}
          </button>
        </div>
      </section>
    </main>
  );
}
