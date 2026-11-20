import 'client-only';

import { createBrowserSupabaseClient } from './client';

interface SessionReader {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token: string } | null };
      error: unknown;
    }>;
  };
}

/**
 * Token de acceso de la sesión del cliente de Supabase, para enviarlo como
 * `Authorization: Bearer` a la API. El cliente del navegador comparte la
 * sesión persistida entre sus consumidores.
 */
export async function getAccessToken(
  client: SessionReader = createBrowserSupabaseClient(),
): Promise<string | null> {
  const { data, error } = await client.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}
