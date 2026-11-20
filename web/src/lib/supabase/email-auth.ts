import { createBrowserSupabaseClient } from './client';

type EmailAuthClient = {
  auth: {
    signInWithOtp(credentials: {
      email: string;
      options: { emailRedirectTo: string; shouldCreateUser: boolean };
    }): Promise<{ error: Error | null }>;
  };
};

export async function sendEmailSignInLink(
  email: string,
  shouldCreateUser: boolean,
  client: EmailAuthClient = createBrowserSupabaseClient(),
): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: new URL(
        '/login?emailConfirmed=1',
        window.location.origin,
      ).toString(),
      shouldCreateUser,
    },
  });

  if (error) {
    throw error;
  }
}
