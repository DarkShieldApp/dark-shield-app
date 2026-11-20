import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerWithPassword,
  requestPasswordReset,
  signInWithPassword,
  updatePasswordAndUsername,
} from '../src/lib/supabase/password-auth';

const client = {
  auth: {
    signUp: vi.fn(async () => ({ error: null })),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    setSession: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
  },
};
const origin = 'https://darkshield.example';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', { location: { origin } });
});

describe('autenticación con contraseña', () => {
  it('registra usuario, correo y contraseña como metadatos de Auth', async () => {
    await registerWithPassword(
      '@Ejemplo',
      ' persona@example.com ',
      'contraseña-segura',
      client,
    );

    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: 'persona@example.com',
      password: 'contraseña-segura',
      options: {
        emailRedirectTo: `${origin}/login?emailConfirmed=1`,
        data: { username: 'ejemplo' },
      },
    });
  });

  it('rechaza nombres de usuario inválidos antes de llamar a Auth', async () => {
    await expect(
      registerWithPassword('@ab', 'persona@example.com', 'password', client),
    ).rejects.toThrow('Usa un nombre de usuario');
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it('envía recuperación al correo y actualiza usuario y contraseña', async () => {
    await requestPasswordReset(' persona@example.com ', client);
    await updatePasswordAndUsername('@Nuevo', 'new-password', client);

    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'persona@example.com',
      { redirectTo: `${origin}/login?resetPassword=1` },
    );
    expect(client.auth.updateUser).toHaveBeenCalledWith({
      password: 'new-password',
      data: { username: 'nuevo' },
    });
  });

  it('usa el acceso por contraseña directamente para correos', async () => {
    const fetcher = vi.fn();

    await signInWithPassword(
      'persona@example.com',
      'password',
      client,
      fetcher,
    );

    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'persona@example.com',
      password: 'password',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('resuelve el acceso por usuario en el servidor y persiste la sesión', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ accessToken: 'access', refreshToken: 'refresh' }),
    );

    await signInWithPassword('@Ejemplo', 'password', client, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      '/api/auth/sign-in',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'ejemplo', password: 'password' }),
      }),
    );
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: 'refresh',
    });
  });

  it('no crea sesión si la autenticación por usuario falla', async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { code: 'INVALID_CREDENTIALS' } },
        { status: 401 },
      ),
    );

    await expect(
      signInWithPassword('@Ejemplo', 'wrong', client, fetcher),
    ).rejects.toThrow('contraseña incorrectos');
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });
});
