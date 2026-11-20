import 'client-only';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

// Keep the browser client stateless; HU-11 T3 adds session persistence.
export function createBrowserSupabaseClient() {
  const { url, publishableKey } = getSupabaseConfig();
  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await createBrowserSupabaseClient().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: new URL('/', window.location.origin).toString(),
    },
  });

  if (error) {
    throw error;
  }
}
