import 'server-only';

import { createClient } from '@supabase/supabase-js';
import {
  getSupabaseConfig,
  SupabaseConfigurationError,
} from '../lib/supabase/config';
import { createServerSupabaseClient } from './supabase';

function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new SupabaseConfigurationError(
      'Falta SUPABASE_SECRET_KEY para iniciar sesión con nombre de usuario.',
    );
  }

  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(secretKey)) {
    throw new SupabaseConfigurationError(
      'SUPABASE_SECRET_KEY debe ser una clave secreta sb_secret_.',
    );
  }

  const { url } = getSupabaseConfig();
  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function authenticateUsername(
  username: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const adminClient = createAdminClient();
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, is_active')
    .eq('username', username)
    .maybeSingle();

  if (profileError) {
    throw new Error('No se pudo consultar la cuenta.');
  }

  if (!profile || !profile.is_active) {
    return null;
  }

  const { data: userData, error: userError } =
    await adminClient.auth.admin.getUserById(profile.id);

  if (userError) {
    if (userError.status === 404) {
      return null;
    }

    throw new Error('No se pudo consultar la cuenta.');
  }

  if (!userData.user.email) {
    return null;
  }

  const { data: authData, error: authError } =
    await createServerSupabaseClient().auth.signInWithPassword({
      email: userData.user.email,
      password,
    });

  if (authError) {
    if (
      authError.status === 0 ||
      (authError.status !== undefined && authError.status >= 500)
    ) {
      throw new Error('El servicio de autenticación no está disponible.');
    }

    return null;
  }

  if (!authData.session) {
    return null;
  }

  return {
    accessToken: authData.session.access_token,
    refreshToken: authData.session.refresh_token,
  };
}
