import { NextResponse } from 'next/server';
import { SupabaseConfigurationError } from '../../../lib/supabase/config';
import { createReport, ReportApiError } from '../../../server/reports';

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match?.[1]?.trim() ?? null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_JSON',
          message: 'El cuerpo de la petición no es un JSON válido.',
        },
      },
      { status: 400 },
    );
  }

  const accessToken = extractBearerToken(request.headers.get('authorization'));

  try {
    const report = await createReport(body, accessToken);
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof ReportApiError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        },
        { status: error.status },
      );
    }

    if (error instanceof SupabaseConfigurationError) {
      return NextResponse.json(
        {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message:
              'El servicio de base de datos no está configurado en el servidor.',
          },
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error inesperado al procesar la creación del reporte.',
        },
      },
      { status: 500 },
    );
  }
}
