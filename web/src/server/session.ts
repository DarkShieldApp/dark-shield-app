import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from './supabase';

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
