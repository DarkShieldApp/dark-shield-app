'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | undefined;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (supabase) {
    return supabase;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  supabase = createClient(supabaseUrl, supabasePublishableKey);
  return supabase;
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: new URL('/', window.location.origin).toString(),
    },
  });

  if (error) {
    throw error;
  }
}
