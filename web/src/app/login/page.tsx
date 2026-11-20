'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { sendEmailSignInLink } from '../../lib/supabase/email-auth';

type AuthAction = 'sign-up' | 'sign-in' | 'callback';
type FormFeedback = {
  action: AuthAction;
  kind: 'error' | 'success';
  message: string;
};

export default function LoginPage() {
  const {
    session,
    isLoading: isSessionLoading,
    error: sessionError,
  } = useAuth();
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signInEmail, setSignInEmail] = useState('');
  const [pendingAction, setPendingAction] = useState<AuthAction | null>(null);
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);

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
        setFeedback({
          action: 'callback',
          kind: 'error',
          message: sessionError.message,
        });
      } else if (emailConfirmed) {
        setFeedback({
          action: 'callback',
          kind: 'success',
          message: session
            ? 'Correo confirmado. Has iniciado sesión.'
            : 'Correo confirmado. Ya puedes solicitar un enlace de acceso.',
        });
      } else if (session) {
        setFeedback({
          action: 'callback',
          kind: 'success',
          message: 'Has iniciado sesión correctamente.',
        });
      }
    });

    return () => {
      active = false;
    };
  }, [isSessionLoading, session, sessionError]);

  async function handleEmailAuth(
    event: FormEvent<HTMLFormElement>,
    action: AuthAction,
  ) {
    event.preventDefault();
    setPendingAction(action);
    setFeedback(null);
    const email = action === 'sign-up' ? signUpEmail : signInEmail;

    try {
      await sendEmailSignInLink(email.trim(), action === 'sign-up');
      setFeedback({
        action,
        kind: 'success',
        message:
          action === 'sign-up'
            ? 'Si puedes crear una cuenta con ese correo, recibirás un enlace para confirmarla.'
            : 'Si existe una cuenta con ese correo, recibirás un enlace para iniciar sesión.',
      });
    } catch (error) {
      setFeedback({
        action,
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'No se pudo enviar el enlace de correo.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="page-container">
      <nav className="breadcrumb">
        <Link href="/" className="back-link">
          ← Volver al inicio
        </Link>
      </nav>

      <header className="auth-page-heading">
        <span className="badge">Cuenta · HU-11</span>
        <h1 id="login-title">Accede a DarkShield</h1>
        <p className="subtitle">
          Crea una cuenta o inicia sesión con un enlace de confirmación enviado
          a tu correo.
        </p>
      </header>

      {feedback?.action === 'callback' && (
        <p
          className={
            feedback.kind === 'error' ? 'error-summary' : 'success-notice'
          }
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      )}

      <div className="auth-panels">
        <section
          className="form-card auth-panel"
          aria-labelledby="signup-title"
        >
          <h2 id="signup-title">Crear cuenta</h2>
          <p className="subtitle">
            Te enviaremos un enlace para confirmar tu correo y activar la
            cuenta.
          </p>
          {feedback?.action === 'sign-up' && (
            <p
              className={
                feedback.kind === 'error' ? 'error-summary' : 'success-notice'
              }
              role={feedback.kind === 'error' ? 'alert' : 'status'}
            >
              {feedback.message}
            </p>
          )}
          <form onSubmit={(event) => handleEmailAuth(event, 'sign-up')}>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-email">
                Correo electrónico
              </label>
              <input
                className="form-control"
                id="signup-email"
                type="email"
                autoComplete="email"
                required
                value={signUpEmail}
                onChange={(event) => setSignUpEmail(event.target.value)}
                disabled={pendingAction !== null}
              />
            </div>
            <button
              className="btn-primary"
              type="submit"
              disabled={pendingAction !== null}
              aria-busy={pendingAction === 'sign-up'}
            >
              {pendingAction === 'sign-up'
                ? 'Enviando confirmación…'
                : 'Crear cuenta'}
            </button>
          </form>
        </section>

        <section
          className="form-card auth-panel"
          aria-labelledby="signin-title"
        >
          <h2 id="signin-title">Iniciar sesión</h2>
          <p className="subtitle">
            Si ya tienes cuenta, solicita un enlace para entrar.
          </p>
          {feedback?.action === 'sign-in' && (
            <p
              className={
                feedback.kind === 'error' ? 'error-summary' : 'success-notice'
              }
              role={feedback.kind === 'error' ? 'alert' : 'status'}
            >
              {feedback.message}
            </p>
          )}
          <form onSubmit={(event) => handleEmailAuth(event, 'sign-in')}>
            <div className="form-group">
              <label className="form-label" htmlFor="signin-email">
                Correo electrónico
              </label>
              <input
                className="form-control"
                id="signin-email"
                type="email"
                autoComplete="email"
                required
                value={signInEmail}
                onChange={(event) => setSignInEmail(event.target.value)}
                disabled={pendingAction !== null}
              />
            </div>
            <button
              className="btn-primary"
              type="submit"
              disabled={pendingAction !== null}
              aria-busy={pendingAction === 'sign-in'}
            >
              {pendingAction === 'sign-in'
                ? 'Enviando enlace…'
                : 'Iniciar sesión'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
