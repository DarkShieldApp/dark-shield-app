import { NextResponse } from 'next/server';
import {
  extractBearerToken,
  requestEvidenceUploads,
  runEvidenceOperation,
} from '../../../../../../server/evidences';

interface RouteContext {
  params: Promise<{ reportId: string }>;
}

// HU-06/T4, paso 1: valida lo declarado y devuelve URL firmadas de subida.
export async function POST(request: Request, { params }: RouteContext) {
  const { reportId } = await params;
  const { status, body } = await runEvidenceOperation(201, () =>
    requestEvidenceUploads({
      reportId,
      accessToken: extractBearerToken(request.headers.get('authorization')),
      readBody: () => request.json(),
    }),
  );
  return NextResponse.json(body, { status });
}
