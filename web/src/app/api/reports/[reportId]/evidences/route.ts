import { NextResponse } from 'next/server';
import {
  confirmEvidence,
  extractBearerToken,
  listReportEvidences,
  runEvidenceOperation,
} from '../../../../../server/evidences';

interface RouteContext {
  params: Promise<{ reportId: string }>;
}

// HU-06/T4, paso 3: confirma una subida y registra la evidencia.
export async function POST(request: Request, { params }: RouteContext) {
  const { reportId } = await params;
  const { status, body } = await runEvidenceOperation(201, () =>
    confirmEvidence({
      reportId,
      accessToken: extractBearerToken(request.headers.get('authorization')),
      readBody: () => request.json(),
    }),
  );
  return NextResponse.json(body, { status });
}

// Evidencias legibles del reporte, con URL firmadas de lectura.
export async function GET(request: Request, { params }: RouteContext) {
  const { reportId } = await params;
  const { status, body } = await runEvidenceOperation(200, () =>
    listReportEvidences({
      reportId,
      accessToken: extractBearerToken(request.headers.get('authorization')),
      searchParams: new URL(request.url).searchParams,
    }),
  );
  return NextResponse.json(body, { status });
}
