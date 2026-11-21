'use client';

import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createBrowserSupabaseClient } from '../lib/supabase/client';

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  error: Error | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Error de autenticación.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;

    async function subscribeToSession() {
      try {
        await Promise.resolve();
        if (!active) {
          return;
        }

        const { data } = createBrowserSupabaseClient().auth.onAuthStateChange(
          (_event, currentSession) => {
            setSession(currentSession);
            setIsLoading(false);
            setError(null);
          },
        );
        subscription = data.subscription;
      } catch (authError) {
        if (active) {
          setError(toError(authError));
          setIsLoading(false);
        }
      }
    }

    void subscribeToSession();

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error: signOutError } =
        await createBrowserSupabaseClient().auth.signOut();
      if (signOutError) {
        throw signOutError;
      }
    } catch (authError) {
      const nextError = toError(authError);
      setError(nextError);
      throw nextError;
    }
  }, []);

  const value = useMemo(
    () => ({ session, isLoading, error, signOut }),
    [session, isLoading, error, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.');
  }
  return auth;
}
