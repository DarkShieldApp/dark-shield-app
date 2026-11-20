import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../src/server/username-auth', () => ({
  authenticateUsername: vi.fn(),
}));

import { POST } from '../src/app/api/auth/sign-in/route';
import { authenticateUsername } from '../src/server/username-auth';

function createRequest(
  body: unknown,
  contentType = 'application/json',
): Request {
  return new Request('http://localhost:3000/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/sign-in', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('normalizes the username and returns only session tokens', async () => {
    vi.mocked(authenticateUsername).mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const response = await POST(
      createRequest({ username: '@Ejemplo', password: 'password' }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(authenticateUsername).toHaveBeenCalledWith('ejemplo', 'password');
  });

  it('returns a generic authentication error for invalid credentials', async () => {
    vi.mocked(authenticateUsername).mockResolvedValue(null);

    const response = await POST(
      createRequest({ username: 'ejemplo', password: 'wrong' }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'No se pudo iniciar sesión.',
      },
    });
  });

  it('rejects invalid requests without consulting Auth', async () => {
    const response = await POST(
      createRequest({ username: 'ab', password: 'password' }),
    );

    expect(response.status).toBe(401);
    expect(authenticateUsername).not.toHaveBeenCalled();
  });

  it('requires JSON request bodies', async () => {
    const response = await POST(
      createRequest(
        { username: 'ejemplo', password: 'password' },
        'text/plain',
      ),
    );

    expect(response.status).toBe(400);
    expect(authenticateUsername).not.toHaveBeenCalled();
  });
});
