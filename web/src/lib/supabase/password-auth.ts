import { isEmailIdentifier, normalizeUsername } from '../auth/username';
import { getSafeReturnPath } from '../auth/return-path';
import { createBrowserSupabaseClient } from './client';

type PasswordAuthClient = {
  auth: {
    signUp(credentials: {
      email: string;
      password: string;
      options: { emailRedirectTo: string; data: { username: string } };
    }): Promise<{ error: Error | null }>;
    signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<{ error: Error | null }>;
    setSession(credentials: {
      access_token: string;
      refresh_token: string;
    }): Promise<{ error: Error | null }>;
    resetPasswordForEmail(
      email: string,
      options: { redirectTo: string },
    ): Promise<{ error: Error | null }>;
    updateUser(attributes: {
      password: string;
      data: { username: string };
    }): Promise<{ error: Error | null }>;
  };
};

type UsernameSessionResponse = {
  accessToken: string;
  refreshToken: string;
};

function isUsernameSessionResponse(
  value: unknown,
): value is UsernameSessionResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'accessToken' in value &&
    typeof value.accessToken === 'string' &&
    'refreshToken' in value &&
    typeof value.refreshToken === 'string'
  );
}

export async function registerWithPassword(
  username: string,
  email: string,
  password: string,
  client: PasswordAuthClient = createBrowserSupabaseClient(),
): Promise<void> {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new Error('Usa un nombre de usuario de 3 a 30 letras, números o _.');
  }

  const redirectTo = new URL('/login?emailConfirmed=1', window.location.origin);
  const returnPath = getSafeReturnPath(
    new URLSearchParams(window.location.search).get('next'),
    window.location.origin,
  );
  if (returnPath) {
    redirectTo.searchParams.set('next', returnPath);
  }

  const { error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: redirectTo.toString(),
      data: { username: normalizedUsername },
    },
  });

  if (error) {
    throw error;
  }
}

export async function requestPasswordReset(
  email: string,
  client: PasswordAuthClient = createBrowserSupabaseClient(),
): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: new URL(
      '/login?resetPassword=1',
      window.location.origin,
    ).toString(),
  });

  if (error) {
    throw error;
  }
}

export async function updatePasswordAndUsername(
  username: string,
  password: string,
  client: PasswordAuthClient = createBrowserSupabaseClient(),
): Promise<void> {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new Error('Usa un nombre de usuario de 3 a 30 letras, números o _.');
  }

  const { error } = await client.auth.updateUser({
    password,
    data: { username: normalizedUsername },
  });

  if (error) {
    throw error;
  }
}

export async function signInWithPassword(
  identifier: string,
  password: string,
  client: PasswordAuthClient = createBrowserSupabaseClient(),
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const value = identifier.trim();

  if (isEmailIdentifier(value)) {
    const { error } = await client.auth.signInWithPassword({
      email: value,
      password,
    });

    if (error) {
      throw new Error(
        'Usuario/correo o contraseña incorrectos, o el correo aún no está confirmado.',
      );
    }

    return;
  }

  const username = normalizeUsername(value);
  if (!username) {
    throw new Error('Introduce un correo o nombre de usuario válido.');
  }

  const response = await fetcher('/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (response.status === 503) {
    throw new Error(
      'El acceso con nombre de usuario no está configurado o no está disponible.',
    );
  }

  if (!response.ok) {
    throw new Error(
      'Usuario/correo o contraseña incorrectos, o el correo aún no está confirmado.',
    );
  }

  const session: unknown = await response.json();
  if (!isUsernameSessionResponse(session)) {
    throw new Error(
      'El servicio de autenticación devolvió una respuesta inválida.',
    );
  }

  const { error } = await client.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });

  if (error) {
    throw error;
  }
}
