'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from './AuthProvider';

export default function AuthControls() {
  const { session, isLoading, signOut } = useAuth();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const email = session?.user.email;
  const displayName = email ?? 'Mi cuenta';
  const initials = displayName.slice(0, 1).toLocaleUpperCase();

  async function handleSignOut() {
    setIsSigningOut(true);
    setErrorMessage(null);

    try {
      await signOut();
      setIsOpen(false);
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
        <div className="profile-control">
          <button
            className="profile-trigger"
            type="button"
            aria-expanded={isOpen}
            aria-controls="profile-menu"
            aria-label={`Menú de cuenta: ${displayName}`}
            onClick={() => setIsOpen((open) => !open)}
          >
            <span className="profile-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="profile-trigger-name">{displayName}</span>
            <span className="profile-chevron" aria-hidden="true">
              {isOpen ? '▴' : '▾'}
            </span>
          </button>
          {isOpen && (
            <div className="profile-menu" id="profile-menu">
              <p className="profile-menu-email">{email ?? 'Sesión activa'}</p>
              <button
                className="profile-menu-signout"
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                aria-busy={isSigningOut}
              >
                {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
              </button>
            </div>
          )}
        </div>
      ) : (
        pathname !== '/login' && (
          <Link href="/login" className="back-link">
            Acceder
          </Link>
        )
      )}
      {errorMessage && (
        <span className="field-error" role="alert">
          {errorMessage}
        </span>
      )}
    </nav>
  );
}
