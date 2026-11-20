'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { isEmailIdentifier } from '../../lib/auth/username';
import {
  registerWithPassword,
  requestPasswordReset,
  signInWithPassword,
  updatePasswordAndUsername,
} from '../../lib/supabase/password-auth';

type AuthAction =
  'sign-up' | 'sign-in' | 'password-reset' | 'password-update' | 'callback';
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
  const [signUpUsername, setSignUpUsername] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signInIdentifier, setSignInIdentifier] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordConfirmation, setRecoveryPasswordConfirmation] =
    useState('');
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [pendingAction, setPendingAction] = useState<AuthAction | null>(null);
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const emailConfirmed = query.get('emailConfirmed') === '1';
    const passwordRecovery =
      query.get('resetPassword') === '1' ||
      new URLSearchParams(window.location.hash.slice(1)).get('type') ===
        'recovery';
    const hasAuthCallback =
      window.location.hash.includes('access_token=') || query.has('code');

    if (passwordRecovery) {
      let active = true;
      queueMicrotask(() => {
        if (!active) {
          return;
        }

        setIsPasswordRecovery(true);
        if (!isSessionLoading && !session) {
          setFeedback({
            action: 'callback',
            kind: 'error',
            message:
              'El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.',
          });
        }
      });

      return () => {
        active = false;
      };
    }

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
            : 'Correo confirmado. Ya puedes entrar con tu nombre de usuario o correo y contraseña.',
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

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction('sign-up');
    setFeedback(null);

    try {
      await registerWithPassword(signUpUsername, signUpEmail, signUpPassword);
      setSignUpPassword('');
      setFeedback({
        action: 'sign-up',
        kind: 'success',
        message:
          'Revisa tu correo y confirma la cuenta. Después podrás iniciar sesión con tu nombre de usuario o correo y contraseña.',
      });
    } catch (error) {
      setFeedback({
        action: 'sign-up',
        kind: 'error',
        message:
          error instanceof Error
            ? `No se pudo crear la cuenta: ${error.message}`
            : 'No se pudo crear la cuenta. Comprueba los datos y que el nombre de usuario esté disponible.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction('sign-in');
    setFeedback(null);

    try {
      await signInWithPassword(signInIdentifier, signInPassword);
      setSignInPassword('');
      setFeedback({
        action: 'sign-in',
        kind: 'success',
        message: 'Has iniciado sesión correctamente.',
      });
    } catch (error) {
      setFeedback({
        action: 'sign-in',
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'No se pudo iniciar sesión. Inténtalo de nuevo.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction('password-reset');
    setFeedback(null);

    try {
      await requestPasswordReset(resetEmail);
      setFeedback({
        action: 'password-reset',
        kind: 'success',
        message:
          'Si el correo está registrado, recibirás un enlace para establecer tu contraseña.',
      });
    } catch (error) {
      setFeedback({
        action: 'password-reset',
        kind: 'error',
        message:
          error instanceof Error
            ? `No se pudo enviar el enlace: ${error.message}`
            : 'No se pudo enviar el enlace. Comprueba el correo e inténtalo de nuevo.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoveryPassword !== recoveryPasswordConfirmation) {
      setFeedback({
        action: 'password-update',
        kind: 'error',
        message: 'Las contraseñas no coinciden.',
      });
      return;
    }

    setPendingAction('password-update');
    setFeedback(null);

    try {
      await updatePasswordAndUsername(recoveryUsername, recoveryPassword);
      setRecoveryPassword('');
      setRecoveryPasswordConfirmation('');
      setIsPasswordRecovery(false);
      window.history.replaceState(null, '', '/login');
      setFeedback({
        action: 'password-update',
        kind: 'success',
        message:
          'Tu contraseña y nombre de usuario están listos. Ya puedes iniciar sesión con cualquiera de los dos.',
      });
    } catch (error) {
      setFeedback({
        action: 'password-update',
        kind: 'error',
        message:
          error instanceof Error
            ? `No se pudo actualizar la cuenta: ${error.message}`
            : 'No se pudo actualizar la cuenta. Comprueba que el nombre de usuario esté disponible e inténtalo de nuevo.',
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
          Regístrate con correo y contraseña. Confirma tu correo para acceder.
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
            Te enviaremos un correo para confirmar tu cuenta.
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
          <form onSubmit={handleSignUp}>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-username">
                Nombre de usuario
              </label>
              <input
                className="form-control"
                id="signup-username"
                type="text"
                autoComplete="username"
                placeholder="@ejemplo"
                minLength={3}
                maxLength={31}
                pattern="@?[A-Za-z0-9_]{3,30}"
                title="Usa de 3 a 30 letras, números o guiones bajos; puedes empezar con @."
                required
                value={signUpUsername}
                onChange={(event) => setSignUpUsername(event.target.value)}
                disabled={pendingAction !== null}
              />
            </div>
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
            <div className="form-group">
              <label className="form-label" htmlFor="signup-password">
                Contraseña
              </label>
              <input
                className="form-control"
                id="signup-password"
                type="password"
                autoComplete="new-password"
                required
                value={signUpPassword}
                onChange={(event) => setSignUpPassword(event.target.value)}
                disabled={pendingAction !== null}
              />
            </div>
            <button
              className="btn-primary"
              type="submit"
              disabled={pendingAction !== null}
              aria-busy={pendingAction === 'sign-up'}
            >
              {pendingAction === 'sign-up' ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>
          </form>
        </section>

        <section
          className="form-card auth-panel"
          aria-labelledby="signin-title"
        >
          <h2 id="signin-title">Iniciar sesión</h2>
          <p className="subtitle">
            Usa el nombre de usuario o el correo de una cuenta confirmada.
          </p>
          {(feedback?.action === 'sign-in' ||
            feedback?.action === 'password-reset' ||
            feedback?.action === 'password-update') && (
            <p
              className={
                feedback.kind === 'error' ? 'error-summary' : 'success-notice'
              }
              role={feedback.kind === 'error' ? 'alert' : 'status'}
            >
              {feedback.message}
            </p>
          )}
          {isPasswordRecovery ? (
            <form onSubmit={handlePasswordUpdate}>
              <div className="form-group">
                <label className="form-label" htmlFor="recovery-username">
                  Nombre de usuario
                </label>
                <input
                  className="form-control"
                  id="recovery-username"
                  type="text"
                  autoComplete="username"
                  placeholder="@ejemplo"
                  minLength={3}
                  maxLength={31}
                  pattern="@?[A-Za-z0-9_]{3,30}"
                  required
                  value={recoveryUsername}
                  onChange={(event) => setRecoveryUsername(event.target.value)}
                  disabled={pendingAction !== null}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="recovery-password">
                  Nueva contraseña
                </label>
                <input
                  className="form-control"
                  id="recovery-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={recoveryPassword}
                  onChange={(event) => setRecoveryPassword(event.target.value)}
                  disabled={pendingAction !== null || !session}
                />
              </div>
              <div className="form-group">
                <label
                  className="form-label"
                  htmlFor="recovery-password-confirmation"
                >
                  Repite la contraseña
                </label>
                <input
                  className="form-control"
                  id="recovery-password-confirmation"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={recoveryPasswordConfirmation}
                  onChange={(event) =>
                    setRecoveryPasswordConfirmation(event.target.value)
                  }
                  disabled={pendingAction !== null || !session}
                />
              </div>
              <button
                className="btn-primary"
                type="submit"
                disabled={pendingAction !== null || !session}
                aria-busy={pendingAction === 'password-update'}
              >
                {pendingAction === 'password-update'
                  ? 'Actualizando…'
                  : 'Guardar contraseña'}
              </button>
            </form>
          ) : isRequestingReset ? (
            <form onSubmit={handlePasswordReset}>
              <div className="form-group">
                <label className="form-label" htmlFor="reset-email">
                  Correo electrónico
                </label>
                <input
                  className="form-control"
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  disabled={pendingAction !== null}
                />
              </div>
              <button
                className="btn-primary"
                type="submit"
                disabled={pendingAction !== null}
                aria-busy={pendingAction === 'password-reset'}
              >
                {pendingAction === 'password-reset'
                  ? 'Enviando enlace…'
                  : 'Enviar enlace de recuperación'}
              </button>
              <button
                className="auth-text-button"
                type="button"
                onClick={() => setIsRequestingReset(false)}
              >
                Volver a iniciar sesión
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={handleSignIn}>
                <div className="form-group">
                  <label className="form-label" htmlFor="signin-identifier">
                    Nombre de usuario o correo electrónico
                  </label>
                  <input
                    className="form-control"
                    id="signin-identifier"
                    type="text"
                    autoComplete="username"
                    placeholder="@ejemplo o correo@ejemplo.com"
                    required
                    value={signInIdentifier}
                    onChange={(event) =>
                      setSignInIdentifier(event.target.value)
                    }
                    disabled={pendingAction !== null}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="signin-password">
                    Contraseña
                  </label>
                  <input
                    className="form-control"
                    id="signin-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={signInPassword}
                    onChange={(event) => setSignInPassword(event.target.value)}
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
                    ? 'Iniciando sesión…'
                    : 'Iniciar sesión'}
                </button>
              </form>
              <button
                className="auth-text-button"
                type="button"
                onClick={() => {
                  setResetEmail(
                    isEmailIdentifier(signInIdentifier)
                      ? signInIdentifier.trim()
                      : '',
                  );
                  setIsRequestingReset(true);
                  setFeedback(null);
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
