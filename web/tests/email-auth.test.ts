import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmailSignInLink } from '../src/lib/supabase/email-auth';

const origin = 'https://darkshield.example';

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin } });
});

describe('enlace de acceso por correo', () => {
  it('solicita un enlace que vuelve a la pantalla de login', async () => {
    const signInWithOtp = vi.fn(async () => ({
      data: { user: null, session: null },
      error: null,
    }));
    const client = { auth: { signInWithOtp } };

    await sendEmailSignInLink('colaborador@example.com', client);

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'colaborador@example.com',
      options: {
        emailRedirectTo: `${origin}/login?emailConfirmed=1`,
      },
    });
  });

  it('propaga errores del proveedor de autenticación', async () => {
    const authError = new Error('No se pudo enviar el correo');
    const client = {
      auth: {
        signInWithOtp: vi.fn(async () => ({ error: authError })),
      },
    };

    await expect(
      sendEmailSignInLink('colaborador@example.com', client),
    ).rejects.toBe(authError);
  });
});
