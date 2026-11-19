import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import { getMyProfile } from '../src/server/profile-query';

// HU-10/T3: Test the authenticated profile query.

const userId = '11111111-1111-4111-8111-111111111111';

const exampleProfile = {
  id: userId,
  display_name: 'Usuario de prueba',
  trust_level: 65,
  is_active: true,
  role_code: 'collaborator',
  created_at: '2026-11-19T10:00:00Z',
  updated_at: '2026-11-19T10:00:00Z',
};

const maybeSingle = vi.fn();
const eqActive = vi.fn(() => ({ maybeSingle }));
const eqId = vi.fn(() => ({ eq: eqActive }));
const select = vi.fn(() => ({ eq: eqId }));
const from = vi.fn(() => ({ select }));

const client = { from } as unknown as SupabaseClient;

describe('getMyProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the authenticated user profile', async () => {
    maybeSingle.mockResolvedValue({
      data: exampleProfile,
      error: null,
    });

    const result = await getMyProfile(client, userId);

    expect(result).toEqual(exampleProfile);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(eqId).toHaveBeenCalledWith('id', userId);
    expect(eqActive).toHaveBeenCalledWith('is_active', true);
  });

  it('returns null when the profile does not exist', async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    expect(await getMyProfile(client, userId)).toBeNull();
  });

  it('throws an error when Supabase fails', async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    });

    await expect(getMyProfile(client, userId)).rejects.toThrow(
      'Unable to retrieve the user profile.',
    );
  });

  it('requests only the authenticated user ID', async () => {
    maybeSingle.mockResolvedValue({
      data: exampleProfile,
      error: null,
    });

    await getMyProfile(client, userId);

    expect(eqId).toHaveBeenCalledWith('id', userId);
    expect(eqId).toHaveBeenCalledTimes(1);
  });

  it('filters inactive profiles', async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    await getMyProfile(client, userId);

    expect(eqActive).toHaveBeenCalledWith('is_active', true);
  });
});
