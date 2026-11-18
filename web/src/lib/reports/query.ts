export const QUERY_ERROR_CODES = {
  MISSING_TARGET: 'MISSING_QUERY_TARGET',
  INVALID_TARGET: 'INVALID_QUERY_TARGET',
  INVALID_TARGET_URL: 'INVALID_TARGET_URL',
  INVALID_TARGET_DOMAIN: 'INVALID_TARGET_DOMAIN',
  INVALID_SCOPE: 'INVALID_QUERY_SCOPE',
  INVALID_LIMIT: 'INVALID_QUERY_LIMIT',
  INVALID_CURSOR: 'INVALID_QUERY_CURSOR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  QUERY_FAILED: 'QUERY_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type QueryErrorCode =
  (typeof QUERY_ERROR_CODES)[keyof typeof QUERY_ERROR_CODES];

export const QUERY_ERROR_MESSAGES: Record<string, string> = {
  MISSING_QUERY_TARGET:
    'Debes proporcionar una página o dominio para realizar la consulta.',
  INVALID_QUERY_TARGET:
    'El objetivo de búsqueda contiene caracteres inválidos o supera la longitud permitida.',
  INVALID_TARGET_URL:
    'Para la búsqueda por página, debes indicar una URL absoluta http o https válida y sin credenciales.',
  INVALID_TARGET_DOMAIN:
    'El dominio no es válido, contiene credenciales, es una dirección IP o es únicamente un sufijo público.',
  INVALID_QUERY_SCOPE:
    'El tipo de búsqueda (scope) debe ser "page" o "domain".',
  INVALID_QUERY_LIMIT:
    'El límite de resultados debe ser un número entero entre 1 y 100.',
  INVALID_QUERY_CURSOR: 'El cursor de paginación no es válido.',
  SERVICE_UNAVAILABLE:
    'El servicio de base de datos no está disponible en este momento.',
  QUERY_FAILED: 'No se pudo completar la consulta de reportes en el servidor.',
  INTERNAL_ERROR: 'Ha ocurrido un error inesperado al consultar los reportes.',
};

export type ReportQueryScope = 'page' | 'domain';

export interface ReportSummaryItem {
  id: string;
  title: string;
  description: string;
  pattern_type: string | null;
  target_url: string;
  page_key: string;
  created_at: string;
}

export interface ReportQueryResult {
  items: ReportSummaryItem[];
  nextCursor: string | null;
}

export interface EmptyQueryState {
  status: 'empty';
  message: string;
  target: string;
  scope: ReportQueryScope;
}

export interface SuccessQueryState {
  status: 'success';
  items: ReportSummaryItem[];
  nextCursor: string | null;
}

export interface ErrorQueryState {
  status: 'error';
  code: string;
  message: string;
  canRetry: boolean;
}

export type ResolvedQueryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | EmptyQueryState
  | SuccessQueryState
  | ErrorQueryState;

export function resolveQueryState(params: {
  isLoading?: boolean;
  result?: ReportQueryResult | null;
  error?: { code: string; message?: string } | null;
  query?: { target: string; scope: ReportQueryScope } | null;
}): ResolvedQueryState {
  if (params.isLoading) {
    return { status: 'loading' };
  }

  if (params.error) {
    const code = params.error.code;
    const message =
      params.error.message ||
      QUERY_ERROR_MESSAGES[code] ||
      QUERY_ERROR_MESSAGES.INTERNAL_ERROR;
    const canRetry = code === 'QUERY_FAILED' || code === 'SERVICE_UNAVAILABLE';
    return {
      status: 'error',
      code,
      message,
      canRetry,
    };
  }

  if (params.result) {
    if (params.result.items.length === 0) {
      return {
        status: 'empty',
        message:
          'No se encontraron reportes asociados a la página o dominio consultado.',
        target: params.query?.target ?? '',
        scope: params.query?.scope ?? 'page',
      };
    }

    return {
      status: 'success',
      items: params.result.items,
      nextCursor: params.result.nextCursor,
    };
  }

  return { status: 'idle' };
}
