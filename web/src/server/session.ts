import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from './supabase';

/** HTTP status takes precedence; JWT codes are a fallback when it is absent. */
export function isPostgrestAuthenticationError(
  error: { code?: string },
  status: number | undefined,
): boolean {
  if (status !== undefined) return status === 401;
  return (
    error.code === 'PGRST301' ||
    error.code === 'PGRST302' ||
    error.code === 'PGRST303'
  );
}

export function extractBearerToken(header: string | null): string | null {
  return /^Bearer +([^\s,]+)$/i.exec(header?.trim() ?? '')?.[1] ?? null;
}

export function createAuthenticatedSupabaseClient(token: string) {
  return createServerSupabaseClient(token);
}

export async function verifyBearer(client: SupabaseClient, token: string) {
  const { data, error } = await client.auth.getUser(token);
  return { userId: error ? null : (data.user?.id ?? null), error };
}
