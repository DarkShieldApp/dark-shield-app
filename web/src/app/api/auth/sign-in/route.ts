import { SupabaseConfigurationError } from '../../../../lib/supabase/config';
import { normalizeUsername } from '../../../../lib/auth/username';
import { authenticateUsername } from '../../../../server/username-auth';

export const runtime = 'nodejs';

const responseHeaders = {
  'Cache-Control': 'private, no-store',
};

function errorResponse(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: responseHeaders },
  );
}

export async function POST(request: Request) {
  if (
    request.headers.get('content-type')?.split(';')[0] !== 'application/json'
  ) {
    return errorResponse(400, 'INVALID_REQUEST', 'La solicitud no es válida.');
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4096) {
    return errorResponse(400, 'INVALID_REQUEST', 'La solicitud no es válida.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_REQUEST', 'La solicitud no es válida.');
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('username' in body) ||
    !('password' in body) ||
    typeof body.username !== 'string' ||
    typeof body.password !== 'string' ||
    body.password.length < 1 ||
    body.password.length > 1024
  ) {
    return errorResponse(400, 'INVALID_REQUEST', 'La solicitud no es válida.');
  }

  const username = normalizeUsername(body.username);
  if (!username) {
    return errorResponse(
      401,
      'INVALID_CREDENTIALS',
      'No se pudo iniciar sesión.',
    );
  }

  try {
    const session = await authenticateUsername(username, body.password);
    if (!session) {
      return errorResponse(
        401,
        'INVALID_CREDENTIALS',
        'No se pudo iniciar sesión.',
      );
    }

    return Response.json(session, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return errorResponse(
        503,
        'SERVICE_UNAVAILABLE',
        'El inicio de sesión con nombre de usuario no está configurado.',
      );
    }

    return errorResponse(
      503,
      'SERVICE_UNAVAILABLE',
      'El servicio de autenticación no está disponible.',
    );
  }
}
