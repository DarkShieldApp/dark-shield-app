/**
 * Subida de evidencias desde el cliente (HU-06/T3, parte 2), siguiendo el
 * flujo en dos pasos de la API de evidencias (docs/api/evidences.md):
 * pedir URL firmadas, subir cada archivo directamente a Storage y confirmarlo.
 *
 * Sin React ni Supabase: recibe `fetch` y la función que da el token, y
 * notifica el estado de cada archivo para mostrar progreso, errores y
 * reintentos. La validación previa la hace `selection.ts`.
 */
import { SupabaseConfigurationError } from '../supabase/config';
import { EVIDENCE_ERROR_CODES, type EvidenceErrorCode } from './rules';
import {
  EVIDENCE_ERROR_MESSAGES,
  type PreparedEvidenceFile,
} from './selection';

export interface EvidenceUploadError {
  code: string;
  message: string;
  /** Si tiene sentido volver a intentarlo sin cambiar nada. */
  retryable: boolean;
}

export type EvidenceUploadState =
  | { phase: 'requesting' | 'uploading' | 'confirming' }
  | { phase: 'done'; evidenceId: string }
  | { phase: 'error'; error: EvidenceUploadError };

export interface EvidenceUploadDeps {
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof fetch;
  onChange: (key: string, state: EvidenceUploadState) => void;
}

/** Mensajes para los errores que no son de un archivo concreto. */
export const EVIDENCE_UPLOAD_MESSAGES = {
  UNAUTHENTICATED: 'Inicia sesión como colaborador para aportar evidencias.',
  FORBIDDEN_INACTIVE_PROFILE:
    'Tu cuenta de colaborador no está activa para aportar evidencias.',
  FORBIDDEN_ROLE:
    'Solo las cuentas con rol de colaborador pueden aportar evidencias.',
  FORBIDDEN_MISSING_PERMISSION:
    'Tu cuenta no tiene permiso para aportar evidencias.',
  REPORT_NOT_FOUND: 'El reporte no existe o ya no está disponible.',
  EVIDENCE_DUPLICATE: 'Esta imagen ya forma parte del reporte.',
  SERVICE_UNAVAILABLE:
    'El servicio no está disponible en este momento. Inténtalo más tarde.',
  SESSION_UNAVAILABLE: 'No se pudo comprobar tu sesión. Vuelve a intentarlo.',
  NETWORK_ERROR:
    'No hay conexión con el servidor. Comprueba tu conexión y reinténtalo.',
  NOT_SENT:
    'No se ha enviado porque otro archivo del envío no es válido. Reinténtalo.',
  UPLOAD_FAILED: 'No se pudo subir el archivo. Reinténtalo.',
  UPLOAD_REJECTED: 'El almacenamiento ha rechazado el archivo.',
  SERVER_ERROR: 'El servidor no pudo completar la operación. Reinténtalo.',
  REQUEST_FAILED: 'No se pudo enviar la evidencia.',
} as const;

type UploadMessageCode = keyof typeof EVIDENCE_UPLOAD_MESSAGES;

const FILE_CODES = new Set<string>(Object.values(EVIDENCE_ERROR_CODES));

function failure(code: string, retryable: boolean): EvidenceUploadState {
  const message = FILE_CODES.has(code)
    ? EVIDENCE_ERROR_MESSAGES[code as EvidenceErrorCode]
    : code in EVIDENCE_UPLOAD_MESSAGES
      ? EVIDENCE_UPLOAD_MESSAGES[code as UploadMessageCode]
      : retryable
        ? EVIDENCE_UPLOAD_MESSAGES.SERVER_ERROR
        : EVIDENCE_UPLOAD_MESSAGES.REQUEST_FAILED;
  return { phase: 'error', error: { code, message, retryable } };
}

interface ApiErrorBody {
  error?: {
    code?: string;
    details?: { index: number | null; code: string }[];
  };
}

/** Traduce una respuesta de error de la API a un estado de error. */
function fromResponse(
  status: number,
  body: ApiErrorBody | null,
): EvidenceUploadState {
  const code = body?.error?.code;
  const detail = body?.error?.details?.[0];
  if (code === 'EVIDENCE_REJECTED' && detail)
    return failure(detail.code, false);
  if (status === 401) return failure('UNAUTHENTICATED', false);
  if (status === 403) {
    if (code === 'FORBIDDEN_ROLE' || code === 'FORBIDDEN_MISSING_PERMISSION') {
      return failure(code, false);
    }
    return failure('FORBIDDEN_INACTIVE_PROFILE', false);
  }
  if (status === 404) return failure('REPORT_NOT_FOUND', false);
  if (status === 409) return failure('EVIDENCE_DUPLICATE', false);
  if (status >= 500) return failure(code ?? 'SERVER_ERROR', true);
  return failure(code ?? 'REQUEST_FAILED', false);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Sube y confirma los archivos de la selección, uno detrás de otro. Devuelve
 * el estado final de cada uno por su clave. Para reintentar un archivo, se
 * vuelve a llamar solo con él: repite el flujo completo con una URL nueva.
 */
export async function uploadEvidences(
  reportId: string,
  items: readonly PreparedEvidenceFile<File>[],
  deps: EvidenceUploadDeps,
): Promise<Record<string, EvidenceUploadState>> {
  const fetcher = deps.fetch ?? fetch;
  const states: Record<string, EvidenceUploadState> = {};
  const set = (key: string, state: EvidenceUploadState) => {
    states[key] = state;
    deps.onChange(key, state);
  };
  const setAll = (state: EvidenceUploadState) =>
    items.forEach(({ key }) => set(key, state));
  if (items.length === 0) return states;

  setAll({ phase: 'requesting' });

  let token: string | null;
  try {
    token = await deps.getAccessToken();
  } catch (error) {
    setAll(
      error instanceof SupabaseConfigurationError
        ? failure('SERVICE_UNAVAILABLE', false)
        : failure('SESSION_UNAVAILABLE', true),
    );
    return states;
  }
  if (!token) {
    setAll(failure('UNAUTHENTICATED', false));
    return states;
  }

  const base = `/api/reports/${encodeURIComponent(reportId)}/evidences`;
  const apiHeaders = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  };

  // Paso 1: URL firmadas para todos los archivos.
  let response: Response;
  try {
    response = await fetcher(`${base}/uploads`, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({
        files: items.map(({ candidate }) => ({
          name: candidate.name,
          type: candidate.type,
          size: candidate.size,
        })),
      }),
    });
  } catch {
    setAll(failure('NETWORK_ERROR', true));
    return states;
  }
  const body = (await readJson(response)) as
    | (ApiErrorBody & { uploads?: { uploadId: string; signedUrl: string }[] })
    | null;

  if (response.status !== 201) {
    const details = body?.error?.details;
    if (
      body?.error?.code === 'EVIDENCE_REJECTED' &&
      details?.every((d) => d.index !== null)
    ) {
      // Rechazos de archivos concretos: el resto no se ha enviado.
      items.forEach(({ key }, index) => {
        const detail = details.find((d) => d.index === index);
        set(
          key,
          detail ? failure(detail.code, false) : failure('NOT_SENT', true),
        );
      });
    } else {
      setAll(fromResponse(response.status, body));
    }
    return states;
  }
  const uploads = body?.uploads ?? [];
  if (uploads.length !== items.length) {
    setAll(failure('SERVER_ERROR', true));
    return states;
  }

  // Pasos 2 y 3, archivo por archivo.
  for (const [index, { key, file }] of items.entries()) {
    const upload = uploads[index]!;
    set(key, { phase: 'uploading' });
    try {
      const put = await fetcher(upload.signedUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!put.ok) {
        const temporary =
          put.status >= 500 || put.status === 408 || put.status === 429;
        set(
          key,
          failure(temporary ? 'UPLOAD_FAILED' : 'UPLOAD_REJECTED', temporary),
        );
        continue;
      }
    } catch {
      set(key, failure('NETWORK_ERROR', true));
      continue;
    }

    set(key, { phase: 'confirming' });
    try {
      const confirm = await fetcher(base, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({
          uploadId: upload.uploadId,
          originalName: file.name,
        }),
      });
      const confirmed = (await readJson(confirm)) as
        (ApiErrorBody & { evidence?: { id: string } }) | null;
      if (confirm.status === 201 && confirmed?.evidence) {
        set(key, { phase: 'done', evidenceId: confirmed.evidence.id });
      } else {
        set(key, fromResponse(confirm.status, confirmed));
      }
    } catch {
      set(key, failure('NETWORK_ERROR', true));
    }
  }
  return states;
}
