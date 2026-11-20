'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from './AuthProvider';

export default function AuthControls() {
  const { session, isLoading, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignOut() {
    setIsSigningOut(true);
    setErrorMessage(null);

    try {
      await signOut();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo cerrar la sesión.',
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <nav className="session-bar" aria-label="Sesión">
      {isLoading ? (
        <span role="status">Comprobando sesión…</span>
      ) : session ? (
        <>
          <span>{session.user.email}</span>
          <button
            className="btn-secondary"
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            aria-busy={isSigningOut}
          >
            {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </>
      ) : (
        <Link href="/login" className="back-link">
          Iniciar sesión
        </Link>
      )}
      {errorMessage && (
        <span className="field-error" role="alert">
          {errorMessage}
        </span>
      )}
    </nav>
  );
}
