import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerWithPassword,
  requestPasswordReset,
  signInWithPassword,
  updatePasswordAndUsername,
} from '../src/lib/supabase/password-auth';

const client = {
  auth: {
    signUp: vi.fn<() => Promise<{ error: Error | null }>>(async () => ({
      error: null,
    })),
    signInWithPassword: vi.fn<() => Promise<{ error: Error | null }>>(
      async () => ({ error: null }),
    ),
    setSession: vi.fn<() => Promise<{ error: Error | null }>>(async () => ({
      error: null,
    })),
    resetPasswordForEmail: vi.fn<() => Promise<{ error: Error | null }>>(
      async () => ({ error: null }),
    ),
    updateUser: vi.fn<() => Promise<{ error: Error | null }>>(async () => ({
      error: null,
    })),
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

  it('preserva un destino interno al confirmar el correo', async () => {
    vi.stubGlobal('window', {
      location: { origin, search: '?next=%2Freports%2Fnew' },
    });

    await registerWithPassword(
      '@Ejemplo',
      'persona@example.com',
      'contraseña-segura',
      client,
    );

    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          emailRedirectTo: `${origin}/login?emailConfirmed=1&next=%2Freports%2Fnew`,
          data: { username: 'ejemplo' },
        },
      }),
    );
  });

  it('rechaza nombres de usuario inválidos antes de llamar a Auth', async () => {
    await expect(
      registerWithPassword('@ab', 'persona@example.com', 'password', client),
    ).rejects.toThrow('Usa un nombre de usuario');
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });

  it('ignora destinos de retorno externos y propaga el error de registro', async () => {
    vi.stubGlobal('window', {
      location: { origin, search: '?next=https%3A%2F%2Fattacker.example' },
    });
    const error = new Error('registration failed');
    client.auth.signUp.mockResolvedValueOnce({ error });

    await expect(
      registerWithPassword(
        '@Ejemplo',
        'persona@example.com',
        'password',
        client,
      ),
    ).rejects.toBe(error);
    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          emailRedirectTo: `${origin}/login?emailConfirmed=1`,
          data: { username: 'ejemplo' },
        },
      }),
    );
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

  it('propaga errores de recuperación, validación y actualización de contraseña', async () => {
    const resetError = new Error('reset failed');
    client.auth.resetPasswordForEmail.mockResolvedValueOnce({
      error: resetError,
    });
    await expect(
      requestPasswordReset('persona@example.com', client),
    ).rejects.toBe(resetError);

    await expect(
      updatePasswordAndUsername('@ab', 'new-password', client),
    ).rejects.toThrow('Usa un nombre de usuario');
    expect(client.auth.updateUser).not.toHaveBeenCalled();

    const updateError = new Error('update failed');
    client.auth.updateUser.mockResolvedValueOnce({ error: updateError });
    await expect(
      updatePasswordAndUsername('@Ejemplo', 'new-password', client),
    ).rejects.toBe(updateError);
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

  it('informa de errores de acceso por correo y usuario no válidos', async () => {
    client.auth.signInWithPassword.mockResolvedValueOnce({
      error: new Error('auth failed'),
    });
    await expect(
      signInWithPassword('persona@example.com', 'wrong', client),
    ).rejects.toThrow('correo o contraseña incorrectos');

    const fetcher = vi.fn();
    await expect(
      signInWithPassword('@@', 'password', client, fetcher),
    ).rejects.toThrow('Introduce un correo o nombre de usuario válido');
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

  it('distingue la API no configurada y otros errores de acceso', async () => {
    const unavailableFetcher = vi.fn(async () =>
      Response.json({}, { status: 503 }),
    );
    await expect(
      signInWithPassword('@Ejemplo', 'password', client, unavailableFetcher),
    ).rejects.toThrow('nombre de usuario no está configurado');

    const serverErrorFetcher = vi.fn(async () =>
      Response.json({}, { status: 500 }),
    );
    await expect(
      signInWithPassword('@Ejemplo', 'password', client, serverErrorFetcher),
    ).rejects.toThrow('correo o contraseña incorrectos');
  });

  it.each([
    null,
    {},
    { accessToken: 'access' },
    { accessToken: 1, refreshToken: 'refresh' },
    { accessToken: 'access', refreshToken: null },
    'invalid',
  ])('rechaza respuestas de sesión inválidas: %j', async (session) => {
    const fetcher = vi.fn(async () => Response.json(session));
    await expect(
      signInWithPassword('@Ejemplo', 'password', client, fetcher),
    ).rejects.toThrow('respuesta inválida');
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });

  it('propaga los errores de persistencia de sesión', async () => {
    client.auth.setSession.mockResolvedValueOnce({
      error: new Error('session failed'),
    });
    const fetcher = vi.fn(async () =>
      Response.json({ accessToken: 'access', refreshToken: 'refresh' }),
    );

    await expect(
      signInWithPassword('@Ejemplo', 'password', client, fetcher),
    ).rejects.toThrow('session failed');
  });
});
