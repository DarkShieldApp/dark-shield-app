import 'server-only';

import { checkAssessmentAuthorization } from './assessment-authorization';
import {
  createAuthenticatedSupabaseClient,
  extractBearerToken,
} from './session';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'private, no-store' };
const errors = {
  INVALID_INPUT: [400, 'La petición de valoración no es válida.'],
  UNAUTHENTICATED: [401, 'Se requiere una sesión válida.'],
  FORBIDDEN: [403, 'No tienes autorización para valorar este reporte.'],
  OWN_REPORT: [403, 'No puedes valorar tu propio reporte.'],
  REPORT_NOT_FOUND: [404, 'No existe el reporte indicado.'],
  ASSESSMENT_CONFLICT: [
    409,
    'La operación entra en conflicto con un cambio concurrente.',
  ],
  POLICY_UNAVAILABLE: [503, 'La política de valoraciones no está disponible.'],
  SERVICE_UNAVAILABLE: [503, 'No se pudo completar la valoración.'],
} as const;
type ErrorCode = keyof typeof errors;
function failure(code: ErrorCode) {
  const [status, message] = errors[code];
  return Response.json({ error: { code, message } }, { status, headers });
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && uuid.test(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** T4: no credibility hook (T7). Success only follows a committed RPC response. */
export async function submitAssessment(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
): Promise<Response> {
  try {
    const authorization = request.headers.get('authorization');
    const decision = await checkAssessmentAuthorization(authorization);
    if (!decision.allowed) {
      if (
        decision.reason === 'UNAUTHENTICATED' ||
        decision.reason === 'INVALID_SESSION'
      ) {
        return failure('UNAUTHENTICATED');
      }
      if (
        decision.reason === 'POLICY_UNAVAILABLE' ||
        decision.reason === 'SERVICE_UNAVAILABLE'
      ) {
        return failure(decision.reason);
      }
      return failure('FORBIDDEN');
    }
    const { reportId } = await context.params;
    if (!isUuid(reportId)) return failure('INVALID_INPUT');
    const body: unknown = await request.json().catch(() => null);
    if (
      !isRecord(body) ||
      Object.keys(body).length !== 1 ||
      (body.action !== 'validate' && body.action !== 'invalidate')
    ) {
      return failure('INVALID_INPUT');
    }
    const token = extractBearerToken(authorization);
    if (!token) return failure('UNAUTHENTICATED');
    const client = createAuthenticatedSupabaseClient(token);
    const { data: policy, error: policyError } =
      await client.rpc('assessment_policy');
    if (policyError) return failure('SERVICE_UNAVAILABLE');
    if (
      !isRecord(policy) ||
      !isUuid(policy.revision) ||
      policy.minimumTrustLevel !== decision.minimumTrustLevel
    ) {
      return failure('POLICY_UNAVAILABLE');
    }
    const { data, error, status } = await client.rpc(
      'submit_report_assessment',
      {
        target_report_id: reportId.toLowerCase(),
        requested_action: body.action,
        expected_policy_revision: policy.revision,
      },
    );
    if (error) {
      if (status === 401) return failure('UNAUTHENTICATED');
      const codes: Record<string, ErrorCode> = {
        '22023': 'INVALID_INPUT',
        '22P02': 'INVALID_INPUT',
        '42501': 'FORBIDDEN',
        PT403: 'OWN_REPORT',
        PT404: 'REPORT_NOT_FOUND',
        PT409: 'ASSESSMENT_CONFLICT',
        '40001': 'ASSESSMENT_CONFLICT',
        '40P01': 'ASSESSMENT_CONFLICT',
        PT503: 'POLICY_UNAVAILABLE',
      };
      return failure(codes[error.code] ?? 'SERVICE_UNAVAILABLE');
    }
    // Do not invent a success from null/malformed upstream data or expose extra columns.
    if (
      !isRecord(data) ||
      !isUuid(data.id) ||
      data.reportId !== reportId.toLowerCase() ||
      data.action !== body.action ||
      typeof data.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(data.createdAt))
    ) {
      return failure('SERVICE_UNAVAILABLE');
    }
    return Response.json(
      {
        id: data.id,
        reportId: data.reportId,
        action: data.action,
        createdAt: data.createdAt,
      },
      { status: 201, headers },
    );
  } catch {
    return failure('SERVICE_UNAVAILABLE');
  }
}
