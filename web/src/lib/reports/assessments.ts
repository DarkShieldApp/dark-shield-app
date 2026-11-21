import 'client-only';

export type AssessmentAction = 'validate' | 'invalidate';
export type AssessmentOutcome =
  | { kind: 'success'; action: AssessmentAction }
  | { kind: 'error'; message: string; requiresLogin: boolean };

export const ASSESSMENT_UNCONFIRMED =
  'No se pudo confirmar el resultado. La valoración podría haberse guardado. No se ha reenviado; consulta el reporte antes de decidir si deseas enviarla otra vez.';

const failures: Record<string, { status: number; message: string }> = {
  INVALID_INPUT: {
    status: 400,
    message:
      'No se pudo enviar la valoración. Revisa el reporte y vuelve a consultarlo.',
  },
  UNAUTHENTICATED: {
    status: 401,
    message:
      'Tu sesión no está disponible o ha caducado. Inicia sesión para valorar.',
  },
  FORBIDDEN: {
    status: 403,
    message:
      'Tu cuenta no tiene autorización para valorar este reporte. Puede deberse a los permisos, al estado de la cuenta o al nivel de confianza.',
  },
  OWN_REPORT: { status: 403, message: 'No puedes valorar tu propio reporte.' },
  REPORT_NOT_FOUND: {
    status: 404,
    message: 'El reporte ya no está disponible. Realiza una nueva consulta.',
  },
  ASSESSMENT_CONFLICT: {
    status: 409,
    message:
      'Las condiciones cambiaron durante el envío. Consulta de nuevo el reporte antes de volver a valorar.',
  },
  POLICY_UNAVAILABLE: {
    status: 503,
    message:
      'Las valoraciones no están disponibles porque la política de participación no está configurada o ha cambiado. Inténtalo más tarde.',
  },
  SERVICE_UNAVAILABLE: { status: 503, message: ASSESSMENT_UNCONFIRMED },
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length === 36 &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const failure = (
  message: string,
  requiresLogin = false,
): AssessmentOutcome => ({ kind: 'error', message, requiresLogin });

/** One POST only. An uncertain response must never trigger an automatic retry. */
export async function sendReportAssessment(
  reportId: string,
  action: AssessmentAction,
  token: string | null,
): Promise<AssessmentOutcome> {
  if (!token) return failure(failures.UNAUTHENTICATED!.message, true);
  if (!isUuid(reportId)) return failure(failures.INVALID_INPUT!.message);
  try {
    const response = await fetch(
      `/api/reports/${reportId.toLowerCase()}/assessments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
        cache: 'no-store',
        redirect: 'error',
      },
    );
    const body: unknown = await response.json();
    if (
      response.status === 201 &&
      isRecord(body) &&
      Object.keys(body).length === 4 &&
      isUuid(body.id) &&
      body.reportId === reportId.toLowerCase() &&
      body.action === action &&
      typeof body.createdAt === 'string' &&
      Number.isFinite(Date.parse(body.createdAt))
    ) {
      return { kind: 'success', action };
    }
    if (
      isRecord(body) &&
      isRecord(body.error) &&
      typeof body.error.code === 'string' &&
      Object.hasOwn(failures, body.error.code)
    ) {
      const known = failures[body.error.code]!;
      if (response.status === known.status)
        return failure(known.message, body.error.code === 'UNAUTHENTICATED');
    }
    return failure(ASSESSMENT_UNCONFIRMED);
  } catch {
    return failure(ASSESSMENT_UNCONFIRMED);
  }
}
