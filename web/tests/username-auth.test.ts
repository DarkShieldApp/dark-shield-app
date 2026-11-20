import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('../src/server/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '../src/server/supabase';
import { authenticateUsername } from '../src/server/username-auth';

const profileQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};

const adminClient = {
  from: vi.fn(() => profileQuery),
  auth: {
    admin: {
      getUserById: vi.fn(),
    },
  },
};

const publicClient = {
  auth: {
    signInWithPassword: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.com');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_server_only_test');

  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);
  profileQuery.maybeSingle.mockResolvedValue({
    data: { id: 'user-id', is_active: true },
    error: null,
  });
  adminClient.auth.admin.getUserById.mockResolvedValue({
    data: { user: { email: 'person@example.com' } },
    error: null,
  });
  publicClient.auth.signInWithPassword.mockResolvedValue({
    data: {
      session: { access_token: 'access-token', refresh_token: 'refresh-token' },
    },
    error: null,
  });

  vi.mocked(createClient).mockReturnValue(
    adminClient as unknown as ReturnType<typeof createClient>,
  );
  vi.mocked(createServerSupabaseClient).mockReturnValue(
    publicClient as unknown as ReturnType<typeof createServerSupabaseClient>,
  );
});

describe('autenticación por nombre de usuario', () => {
  it('resuelve el correo solo en el servidor y devuelve los tokens de Auth', async () => {
    const result = await authenticateUsername('ejemplo', 'password');

    expect(adminClient.from).toHaveBeenCalledWith('profiles');
    expect(profileQuery.eq).toHaveBeenCalledWith('username', 'ejemplo');
    expect(adminClient.auth.admin.getUserById).toHaveBeenCalledWith('user-id');
    expect(publicClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'password',
    });
    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });

  it('no intenta autenticar con un perfil inexistente', async () => {
    profileQuery.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    await expect(
      authenticateUsername('desconocido', 'password'),
    ).resolves.toBeNull();
    expect(adminClient.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(publicClient.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('no intenta autenticar con un perfil inactivo', async () => {
    profileQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: 'user-id', is_active: false },
      error: null,
    });

    await expect(
      authenticateUsername('ejemplo', 'password'),
    ).resolves.toBeNull();
    expect(adminClient.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(publicClient.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('no devuelve sesión si la contraseña falla o falta confirmar el correo', async () => {
    publicClient.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { status: 400 },
    });

    await expect(
      authenticateUsername('ejemplo', 'password'),
    ).resolves.toBeNull();
  });

  it('requiere una clave secreta de servidor', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', undefined);

    await expect(authenticateUsername('ejemplo', 'password')).rejects.toThrow(
      'Falta SUPABASE_SECRET_KEY',
    );
  });
});
