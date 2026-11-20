import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadProfileData } from '../src/app/profile/profile-data';

// HU-10/T3: Test authenticated profile and permissions loading.

const accessToken = 'example-test-token';

const exampleProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  display_name: 'Usuario de prueba',
  trust_level: 65,
  is_active: true,
  role_code: 'collaborator',
  created_at: '2026-11-19T10:00:00Z',
  updated_at: '2026-11-19T10:00:00Z',
};

const examplePermissions = {
  roleCode: 'collaborator',
  permissions: ['reports.create', 'evidences.add'],
};

function mockFetch(profileResponse: Response, permissionsResponse: Response) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(profileResponse)
    .mockResolvedValueOnce(permissionsResponse);

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

describe('loadProfileData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the profile and effective permissions', async () => {
    mockFetch(Response.json(exampleProfile), Response.json(examplePermissions));

    const result = await loadProfileData(accessToken);

    expect(result).toEqual({
      profile: exampleProfile,
      authorization: examplePermissions,
    });
  });

  it('sends the authenticated token to both endpoints', async () => {
    const fetchMock = mockFetch(
      Response.json(exampleProfile),
      Response.json(examplePermissions),
    );

    await loadProfileData(accessToken);

    expect(fetchMock).toHaveBeenCalledWith('/api/me/profile', {
      headers: {
        Authorization: 'Bearer example-test-token',
      },
      cache: 'no-store',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/me/permissions', {
      headers: {
        Authorization: 'Bearer example-test-token',
      },
      cache: 'no-store',
    });
  });

  it('rejects requests without an access token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadProfileData('')).rejects.toThrow(
      'An authenticated session is required.',
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles profile API errors', async () => {
    mockFetch(
      Response.json({ error: 'Unauthorized' }, { status: 401 }),
      Response.json(examplePermissions),
    );

    await expect(loadProfileData(accessToken)).rejects.toThrow(
      'Unable to load profile information.',
    );
  });

  it('handles permissions API errors', async () => {
    mockFetch(
      Response.json(exampleProfile),
      Response.json({ error: 'Forbidden' }, { status: 403 }),
    );

    await expect(loadProfileData(accessToken)).rejects.toThrow(
      'Unable to load profile information.',
    );
  });
});
