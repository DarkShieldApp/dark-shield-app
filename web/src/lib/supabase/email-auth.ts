import { createBrowserSupabaseClient } from './client';

type EmailAuthClient = {
  auth: {
    signInWithOtp(credentials: {
      email: string;
      options: { emailRedirectTo: string };
    }): Promise<{ error: Error | null }>;
  };
};

export async function sendEmailSignInLink(
  email: string,
  client: EmailAuthClient = createBrowserSupabaseClient(),
): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: new URL(
        '/login?emailConfirmed=1',
        window.location.origin,
      ).toString(),
    },
  });

  if (error) {
    throw error;
  }
}
