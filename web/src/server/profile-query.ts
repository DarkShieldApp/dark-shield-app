import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from './profiles';
import { isPostgrestAuthenticationError } from './session';

/** Sanitized classification; never retains the upstream message, details or hint. */
export class ProfileQueryError extends Error {
  constructor(readonly authenticationFailed: boolean) {
    super('Unable to retrieve the user profile.');
    this.name = 'ProfileQueryError';
  }
}

// HU-10/T3: Query the authenticated user's profile and trust level.

export async function getMyProfile(
  client: SupabaseClient,
  userId: string,
): Promise<Profile | null> {
  const { data, error, status } = await client
    .from('profiles')
    .select(
      'id, display_name, trust_level, is_active, role_code, created_at, updated_at',
    )
    .eq('id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new ProfileQueryError(isPostgrestAuthenticationError(error, status));
  }

  return data as Profile | null;
}
