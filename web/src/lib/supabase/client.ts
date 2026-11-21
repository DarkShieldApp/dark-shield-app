import 'client-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

let browserClient: SupabaseClient | undefined;

// Share one persisted session across browser consumers.
export function createBrowserSupabaseClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, publishableKey } = getSupabaseConfig();
  browserClient = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}
