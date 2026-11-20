'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { sendEmailSignInLink } from '../../lib/supabase/email-auth';

export default function LoginPage() {
  const {
    session,
    isLoading: isSessionLoading,
    error: sessionError,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const emailConfirmed =
      new URLSearchParams(window.location.search).get('emailConfirmed') === '1';
    const hasAuthCallback =
      window.location.hash.includes('access_token=') ||
      new URLSearchParams(window.location.search).has('code');

    if ((!emailConfirmed && !hasAuthCallback) || isSessionLoading) {
      return;
    }

    let active = true;
    queueMicrotask(() => {
      if (!active) {
        return;
      }

      if (sessionError) {
        setErrorMessage(sessionError.message);
      } else if (emailConfirmed) {
        setSuccessMessage(
          session
            ? 'Correo confirmado. Has iniciado sesión.'
            : 'Correo confirmado. Ya puedes solicitar un enlace de acceso.',
        );
      } else if (session) {
        setSuccessMessage('Has iniciado sesión correctamente.');
      }
    });

    return () => {
      active = false;
    };
  }, [isSessionLoading, session, sessionError]);

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await sendEmailSignInLink(email.trim());
      setSuccessMessage(
        'Te hemos enviado un enlace de acceso. Revisa tu correo para confirmar e iniciar sesión.',
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo enviar el enlace de acceso.',
      );
    } finally {
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
          Te enviaremos un enlace a tu correo para confirmar e iniciar sesión.
        </p>

        {errorMessage && (
          <p className="error-summary" role="alert">
            {errorMessage}
          </p>
        )}

        {successMessage && (
          <p className="success-notice" role="status">
            {successMessage}
          </p>
        )}

        <form onSubmit={handleEmailSignIn}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Correo electrónico
            </label>
            <input
              className="form-control"
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isLoading}
            />
          </div>
          <button
            className="btn-primary"
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? 'Enviando enlace…' : 'Enviar enlace de acceso'}
          </button>
        </form>
      </section>
    </main>
  );
}
