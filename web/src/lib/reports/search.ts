import {
  QUERY_ERROR_CODES,
  QUERY_ERROR_MESSAGES,
  type ReportCredibilitySummary,
  type ReportQueryResult,
  type ReportQueryScope,
  type ReportSummaryItem,
  type ResolvedQueryState,
} from './query';

/**
 * Cliente de la consulta de reportes (HU-01/T4, T6 y T9): prepara el
 * objetivo, construye la petición de solo lectura a `GET /api/reports` e
 * interpreta la respuesta para `resolveQueryState`.
 */

export const REPORTS_PAGE_SIZE = 10;
export const NETWORK_ERROR_MESSAGE =
  'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.';
export const INVALID_RESPONSE_MESSAGE =
  'La respuesta del servidor no tiene el formato esperado.';

export interface ReportSearchQuery {
  scope: ReportQueryScope;
  target: string;
}

export interface QueryFailure {
  code: string;
  message?: string;
}

export type ReportsPageOutcome =
  | { result: ReportQueryResult; error?: undefined }
  | { error: QueryFailure; result?: undefined };

/**
 * Valida la entrada del buscador y devuelve el objetivo que se envía, o
 * `null` si no es una URL HTTP(S) utilizable. Sin esquema se asume HTTPS.
 * Para página se eliminan query y fragmento antes de enviar; para dominio
 * solo viaja el nombre de host. La API vuelve a validar y normalizar.
 */
export function prepareQueryTarget(
  raw: string,
  scope: ReportQueryScope,
): string | null {
  const input = raw.trim();
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input.includes('://') ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || !url.hostname) return null;
  return scope === 'domain'
    ? url.hostname
    : `${url.protocol}//${url.host}${url.pathname}`;
}

export function buildReportsRequestUrl(
  query: ReportSearchQuery,
  cursor: string | null = null,
  limit: number = REPORTS_PAGE_SIZE,
): string {
  const params = new URLSearchParams({
    scope: query.scope,
    target: query.target,
    limit: String(limit),
  });
  if (cursor) params.set('cursor', cursor);
  return `/api/reports?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const CREDIBILITY_LEVELS: readonly unknown[] = ['low', 'medium', 'high'];
const CREDIBILITY_FACTOR_KEYS = [
  'visibleEvidences',
  'validations',
  'invalidations',
  'assessors',
  'supportWeight',
  'againstWeight',
] as const;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function isCredibilitySummary(
  value: unknown,
): value is ReportCredibilitySummary {
  return (
    isRecord(value) &&
    CREDIBILITY_LEVELS.includes(value.level) &&
    isFiniteNumber(value.score) &&
    value.score >= 0 &&
    value.score <= 100 &&
    typeof value.updatedAt === 'string' &&
    (value.sufficientData === undefined ||
      typeof value.sufficientData === 'boolean') &&
    (value.factors === undefined || isCredibilityFactors(value.factors))
  );
}

function isCredibilityFactors(value: unknown): boolean {
  return (
    isRecord(value) &&
    CREDIBILITY_FACTOR_KEYS.every((key) => isFiniteNumber(value[key]))
  );
}

/**
 * HU-01/T7: una credibilidad mal formada no invalida la respuesta; ese
 * reporte se muestra como «Credibilidad no disponible» (`null`).
 */
function normalizeCredibility(item: ReportSummaryItem): ReportSummaryItem {
  const { credibility } = item;
  if (
    credibility === undefined ||
    credibility === null ||
    isCredibilitySummary(credibility)
  ) {
    return item;
  }
  return { ...item, credibility: null };
}

function isSummaryItem(value: unknown): value is ReportSummaryItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.target_url === 'string' &&
    typeof value.created_at === 'string' &&
    (value.pattern_type === null || typeof value.pattern_type === 'string')
  );
}

/**
 * Traduce una respuesta HTTP al par resultado/error de `resolveQueryState`.
 * Un `200` con `items: []` es una búsqueda correcta sin coincidencias; un
 * error nunca se convierte en lista vacía (HU01-FL-03). Si el código es
 * conocido se deja el mensaje en manos de `QUERY_ERROR_MESSAGES`.
 */
export function parseReportsResponse(
  ok: boolean,
  body: unknown,
): ReportsPageOutcome {
  if (ok) {
    if (
      isRecord(body) &&
      Array.isArray(body.items) &&
      body.items.every(isSummaryItem) &&
      (body.nextCursor === null || typeof body.nextCursor === 'string')
    ) {
      return {
        result: {
          items: body.items.map(normalizeCredibility),
          nextCursor: body.nextCursor,
        },
      };
    }
    return {
      error: {
        code: QUERY_ERROR_CODES.QUERY_FAILED,
        message: INVALID_RESPONSE_MESSAGE,
      },
    };
  }

  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  if (error && typeof error.code === 'string') {
    const known = Object.prototype.hasOwnProperty.call(
      QUERY_ERROR_MESSAGES,
      error.code,
    );
    return {
      error: {
        code: error.code,
        ...(!known && typeof error.message === 'string'
          ? { message: error.message }
          : {}),
      },
    };
  }
  return { error: { code: QUERY_ERROR_CODES.QUERY_FAILED } };
}

export async function fetchReportsPage(
  query: ReportSearchQuery,
  cursor: string | null,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ReportsPageOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(buildReportsRequestUrl(query, cursor), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: options.signal,
    });
  } catch {
    return {
      error: {
        code: QUERY_ERROR_CODES.QUERY_FAILED,
        message: NETWORK_ERROR_MESSAGE,
      },
    };
  }
  const body: unknown = await response.json().catch(() => null);
  return parseReportsResponse(response.ok, body);
}

/** Añade la página siguiente sin repetir reportes ya listados. */
export function mergeReportPages(
  current: ReportQueryResult,
  next: ReportQueryResult,
): ReportQueryResult {
  const seen = new Set(current.items.map(({ id }) => id));
  return {
    items: [...current.items, ...next.items.filter(({ id }) => !seen.has(id))],
    nextCursor: next.nextCursor,
  };
}

/** Texto de la región viva que anuncia el estado de la consulta. */
export function describeQueryStatus(state: ResolvedQueryState): string {
  switch (state.status) {
    case 'loading':
      return 'Buscando reportes…';
    case 'success': {
      const count = state.items.length;
      const more = state.nextCursor ? ' Hay más reportes disponibles.' : '';
      return `${count} ${count === 1 ? 'reporte' : 'reportes'} en la lista.${more}`;
    }
    case 'empty':
    case 'error':
      return state.message;
    default:
      return '';
  }
}
