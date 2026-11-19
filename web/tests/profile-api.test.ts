import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../src/server/profiles';

vi.mock('server-only', () => ({}));

vi.mock('../src/server/session', () => ({
  extractBearerToken: vi.fn(),
  createAuthenticatedSupabaseClient: vi.fn(),
  verifyBearer: vi.fn(),
}));

vi.mock('../src/server/profile-query', () => ({
  getMyProfile: vi.fn(),
}));

import { GET } from '../src/app/api/me/profile/route';
import {
  createAuthenticatedSupabaseClient,
  extractBearerToken,
  verifyBearer,
} from '../src/server/session';
import { getMyProfile } from '../src/server/profile-query';

// HU-10/T3: Test authenticated profile API.

const userId = '11111111-1111-4111-8111-111111111111';

const exampleProfile: Profile = {
  id: userId,
  display_name: 'Usuario de prueba',
  trust_level: 65,
  is_active: true,
  role_code: 'collaborator',
  created_at: '2026-11-19T10:00:00Z',
  updated_at: '2026-11-19T10:00:00Z',
};

function createRequest(token?: string) {
  return new Request('http://localhost:3000/api/me/profile', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/me/profile', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(extractBearerToken).mockImplementation(
      (header) =>
        /^Bearer +([^\s,]+)$/i.exec(header?.trim() ?? '')?.[1] ?? null,
    );

    vi.mocked(createAuthenticatedSupabaseClient).mockReturnValue(
      {} as ReturnType<typeof createAuthenticatedSupabaseClient>,
    );

    vi.mocked(verifyBearer).mockResolvedValue({
      userId,
      error: null,
    });
  });

  it('rejects requests without a token', async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Se requiere un token Bearer válido.',
      },
    });

    expect(getMyProfile).not.toHaveBeenCalled();
  });

  it('rejects invalid sessions', async () => {
    vi.mocked(verifyBearer).mockResolvedValue({
      userId: null,
      error: null,
    });

    const response = await GET(createRequest('invalid-token'));

    expect(response.status).toBe(401);
    expect(getMyProfile).not.toHaveBeenCalled();
  });

  it('returns the authenticated user profile', async () => {
    vi.mocked(getMyProfile).mockResolvedValue(exampleProfile);

    const response = await GET(createRequest('valid-token'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(exampleProfile);
    expect(getMyProfile).toHaveBeenCalledWith(expect.anything(), userId);
  });

  it('rejects unavailable or inactive profiles', async () => {
    vi.mocked(getMyProfile).mockResolvedValue(null);

    const response = await GET(createRequest('valid-token'));

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN');
  });

  it('handles database errors', async () => {
    vi.mocked(getMyProfile).mockRejectedValue(new Error('Database error'));

    const response = await GET(createRequest('valid-token'));

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('INTERNAL_ERROR');
  });

  it('prevents caching of profile information', async () => {
    vi.mocked(getMyProfile).mockResolvedValue(exampleProfile);

    const response = await GET(createRequest('valid-token'));

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
