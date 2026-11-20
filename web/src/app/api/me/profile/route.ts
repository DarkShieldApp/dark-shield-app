import { SupabaseConfigurationError } from '../../../../lib/supabase/config';
import { getMyProfile } from '../../../../server/profile-query';
import {
  createAuthenticatedSupabaseClient,
  extractBearerToken,
  verifyBearer,
} from '../../../../server/session';

// HU-10/T3: Retrieve the authenticated user's profile and trust level.

const responseHeaders = {
  'Cache-Control': 'private, no-store',
};

function errorResponse(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: responseHeaders },
  );
}

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));

    if (!token) {
      return errorResponse(
        401,
        'UNAUTHENTICATED',
        'Se requiere un token Bearer válido.',
      );
    }

    const client = createAuthenticatedSupabaseClient(token);
    const { userId, error } = await verifyBearer(client, token);

    if (error && (error.status === 0 || (error.status ?? 0) >= 500)) {
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        'No se pudo verificar la sesión.',
      );
    }

    if (!userId) {
      return errorResponse(
        401,
        'INVALID_SESSION',
        'La sesión no es válida o ha caducado.',
      );
    }

    const profile = await getMyProfile(client, userId);

    if (!profile) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'El perfil no está disponible o está desactivado.',
      );
    }

    return Response.json(profile, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return errorResponse(
        503,
        'SERVICE_UNAVAILABLE',
        'El servicio de base de datos no está configurado.',
      );
    }

    return errorResponse(
      500,
      'INTERNAL_ERROR',
      'No se pudo recuperar el perfil.',
    );
  }
}
