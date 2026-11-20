import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ALLOWED_EVIDENCE_TYPES,
  EVIDENCE_MAX_FILES,
  EVIDENCE_SIGNATURE_BYTES,
  EVIDENCE_STORAGE_EXTENSIONS,
  validateEvidenceDeclaration,
  validateEvidenceFile,
  type EvidenceBatchError,
  type EvidenceKind,
} from '../lib/evidences/rules';
import { SupabaseConfigurationError } from '../lib/supabase/config';
import { reencodeEvidenceImage } from './evidence-images';
import {
  createAuthenticatedSupabaseClient,
  decodeCursor,
  encodeCursor,
} from './reports';

/**
 * Evidencias de reportes (HU-06/T4). Contrato en docs/domain-design.md y
 * docs/api/evidences.md. Se trabaja siempre como `authenticated` con el token
 * Bearer del usuario: la autorización la decide la RLS de la tabla y del
 * bucket; este módulo valida, recodifica y compensa los fallos.
 */
export const EVIDENCE_BUCKET = 'report-evidences';

/** Caducidad de las URL firmadas de lectura (rango acordado: 60 s a 5 min). */
export const EVIDENCE_SIGNED_URL_SECONDS = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

export class EvidenceApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: EvidenceBatchError[];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: EvidenceBatchError[],
  ) {
    super(message);
    this.name = 'EvidenceApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface EvidenceResource {
  id: string;
  reportId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  moderationStatus: string;
  createdAt: string;
}

export interface EvidenceListItem extends EvidenceResource {
  url: string;
  urlExpiresAt: string;
}

export interface EvidenceServiceOptions {
  /** Cliente ya creado (pruebas); por defecto, uno sin privilegios con el token. */
  client?: SupabaseClient;
  reencode?: (bytes: Uint8Array, kind: EvidenceKind) => Promise<Uint8Array>;
  newId?: () => string;
  now?: () => Date;
  logError?: (message: string, error: unknown) => void;
  /**
   * Se llama tras guardar la evidencia; un fallo se registra y no cambia la
   * respuesta. HU-06/T5 lo usará para recalcular la credibilidad del reporte
   * (HU-09/T2) cuando esté disponible.
   */
  onEvidenceSaved?: (evidence: EvidenceResource) => Promise<void>;
}

interface RequestContext {
  reportId: string;
  accessToken: string | null;
}

interface BodyContext extends RequestContext {
  readBody: () => Promise<unknown>;
}

interface ListContext extends RequestContext {
  searchParams: URLSearchParams;
}

interface EvidenceRow {
  id: string;
  report_id: string;
  storage_path?: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  moderation_status: string;
  created_at: string;
}

const RESOURCE_COLUMNS =
  'id, report_id, original_name, mime_type, size_bytes, moderation_status, created_at';

const defaultLogError = (message: string, error: unknown) =>
  console.error(message, error);

function rejected(details: EvidenceBatchError[]): EvidenceApiError {
  return new EvidenceApiError(
    400,
    'EVIDENCE_REJECTED',
    'Alguno de los archivos no se puede aceptar como evidencia.',
    details,
  );
}

function invalidRequest(message: string): EvidenceApiError {
  return new EvidenceApiError(400, 'INVALID_REQUEST', message);
}

const storageFailed = () =>
  new EvidenceApiError(
    500,
    'EVIDENCE_STORAGE_FAILED',
    'No se pudo completar la operación en el almacenamiento de evidencias.',
  );

const persistenceFailed = () =>
  new EvidenceApiError(
    500,
    'EVIDENCE_PERSISTENCE_FAILED',
    'No se pudo completar la operación en la base de datos.',
  );

export function extractBearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? '');
  return match?.[1]?.trim() || null;
}

function toResource(row: EvidenceRow): EvidenceResource {
  return {
    id: row.id,
    reportId: row.report_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    moderationStatus: row.moderation_status,
    createdAt: row.created_at,
  };
}

/**
 * Sesión (401), perfil activo si se exige (403) y reporte legible (404), en
 * este orden. Devuelve el cliente que se usará en el resto de la operación.
 */
async function authorize(
  { reportId, accessToken }: RequestContext,
  options: EvidenceServiceOptions,
  requireActiveProfile: boolean,
): Promise<{ client: SupabaseClient; userId: string }> {
  const token = accessToken?.trim();
  const unauthenticated = new EvidenceApiError(
    401,
    'UNAUTHENTICATED',
    'Sesión no válida o caducada.',
  );
  if (!token) throw unauthenticated;

  const client = options.client ?? createAuthenticatedSupabaseClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw unauthenticated;
  const userId = data.user.id;

  if (requireActiveProfile) {
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('id, is_active')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) {
      throw new EvidenceApiError(
        500,
        'PROFILE_LOOKUP_FAILED',
        'No se pudo comprobar el estado del perfil.',
      );
    }
    if (!profile?.is_active) {
      throw new EvidenceApiError(
        403,
        'FORBIDDEN_INACTIVE_PROFILE',
        'Tu cuenta de colaborador no está activa para aportar evidencias.',
      );
    }
  }

  const notFound = new EvidenceApiError(
    404,
    'REPORT_NOT_FOUND',
    'El reporte no existe o no está disponible.',
  );
  if (!UUID.test(reportId)) throw notFound;
  const { data: report, error: reportError } = await client
    .from('reports')
    .select('id')
    .eq('id', reportId)
    .maybeSingle();
  if (reportError) {
    throw new EvidenceApiError(
      500,
      'REPORT_LOOKUP_FAILED',
      'No se pudo comprobar el reporte.',
    );
  }
  if (!report) throw notFound;

  return { client, userId };
}

async function readObjectBody(
  readBody: () => Promise<unknown>,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await readBody();
  } catch {
    throw invalidRequest('El cuerpo de la petición no es un JSON válido.');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidRequest('El cuerpo de la petición debe ser un objeto JSON.');
  }
  return value as Record<string, unknown>;
}

async function removeObjects(
  client: SupabaseClient,
  paths: string[],
  logError: (message: string, error: unknown) => void,
) {
  const { error } = await client.storage.from(EVIDENCE_BUCKET).remove(paths);
  // Las rutas no contienen datos personales: UUID de usuario, reporte y objeto.
  if (error)
    logError(`No se pudieron borrar los objetos ${paths.join(', ')}`, error);
}

function objectPath(
  userId: string,
  reportId: string,
  id: string,
  kind: EvidenceKind,
) {
  return `${userId}/${reportId}/${id}.${EVIDENCE_STORAGE_EXTENSIONS[kind]}`;
}

/** Paso 1 del contrato: valida lo declarado y devuelve URL firmadas de subida. */
export async function requestEvidenceUploads(
  context: BodyContext,
  options: EvidenceServiceOptions = {},
): Promise<{
  uploads: {
    uploadId: string;
    path: string;
    token: string;
    signedUrl: string;
  }[];
}> {
  const { client, userId } = await authorize(context, options, true);
  const body = await readObjectBody(context.readBody);
  const files = body.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw invalidRequest('Indica al menos un archivo en "files".');
  }
  if (files.length > EVIDENCE_MAX_FILES) {
    throw rejected([{ index: null, code: 'EVIDENCE_TOO_MANY' }]);
  }

  const declarations = files.map((file: unknown) => {
    const record = file as Record<string, unknown> | null;
    if (
      typeof record !== 'object' ||
      record === null ||
      typeof record.name !== 'string' ||
      typeof record.type !== 'string' ||
      typeof record.size !== 'number'
    ) {
      throw invalidRequest(
        'Cada archivo debe indicar "name" y "type" como texto y "size" como número.',
      );
    }
    return {
      name: record.name.normalize('NFC'),
      type: record.type,
      size: record.size,
    };
  });

  const errors: EvidenceBatchError[] = [];
  const kinds: EvidenceKind[] = [];
  declarations.forEach((declaration, index) => {
    const result = validateEvidenceDeclaration(declaration);
    if (result.ok) kinds.push(result.evidence.kind);
    else errors.push({ index, code: result.code });
  });
  if (errors.length > 0) throw rejected(errors);

  // Cuenta todas sus evidencias del reporte (la RLS le deja ver las suyas,
  // también ocultas). El trigger de la base de datos es la garantía final.
  const { count, error: countError } = await client
    .from('report_evidences')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', context.reportId)
    .eq('uploaded_by', userId);
  if (countError) throw persistenceFailed();
  if ((count ?? 0) + kinds.length > EVIDENCE_MAX_FILES) {
    throw rejected([{ index: null, code: 'EVIDENCE_TOO_MANY' }]);
  }

  const newId = options.newId ?? randomUUID;
  const bucket = client.storage.from(EVIDENCE_BUCKET);
  const uploads = [];
  for (const kind of kinds) {
    const uploadId = newId();
    const path = objectPath(userId, context.reportId, uploadId, kind);
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) throw storageFailed();
    uploads.push({
      uploadId,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
    });
  }
  return { uploads };
}

function kindFromName(name: string): EvidenceKind | null {
  const extension = name.toLowerCase().split('.').pop() ?? '';
  const type = ALLOWED_EVIDENCE_TYPES.find((allowed) =>
    allowed.extensions.includes(extension),
  );
  return type?.kind ?? null;
}

function isNotFound(error: unknown): boolean {
  const { status, statusCode, message } = error as {
    status?: number;
    statusCode?: string;
    message?: string;
  };
  return (
    status === 404 || statusCode === '404' || /not found/i.test(message ?? '')
  );
}

/**
 * Paso 3 del contrato: comprueba el objeto subido con sus bytes reales, guarda
 * una copia recodificada sin metadatos, registra la evidencia y borra el
 * original. Ante cualquier fallo, borra lo que haya guardado.
 */
export async function confirmEvidence(
  context: BodyContext,
  options: EvidenceServiceOptions = {},
): Promise<{ evidence: EvidenceResource }> {
  const { client, userId } = await authorize(context, options, true);
  const logError = options.logError ?? defaultLogError;
  const body = await readObjectBody(context.readBody);
  if (typeof body.uploadId !== 'string' || !UUID.test(body.uploadId)) {
    throw invalidRequest(
      '"uploadId" debe ser el UUID devuelto al pedir la subida.',
    );
  }
  if (typeof body.originalName !== 'string') {
    throw invalidRequest(
      '"originalName" debe ser el nombre original del archivo.',
    );
  }
  const name = body.originalName.normalize('NFC');
  const declaredKind = kindFromName(name);
  if (!declaredKind)
    throw rejected([{ index: 0, code: 'EVIDENCE_TYPE_NOT_ALLOWED' }]);

  const bucket = client.storage.from(EVIDENCE_BUCKET);
  const rawPath = objectPath(
    userId,
    context.reportId,
    body.uploadId,
    declaredKind,
  );
  const { data: blob, error: downloadError } = await bucket.download(rawPath);
  if (downloadError || !blob) {
    if (isNotFound(downloadError)) {
      throw new EvidenceApiError(
        400,
        'EVIDENCE_UPLOAD_MISSING',
        'No se encontró el archivo subido para esta evidencia.',
      );
    }
    throw storageFailed();
  }

  const fail = async (error: EvidenceApiError, paths = [rawPath]) => {
    await removeObjects(client, paths, logError);
    return error;
  };

  // Validación con los bytes reales: tamaño, MIME guardado y magic bytes.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const check = validateEvidenceFile({
    name,
    type: blob.type,
    size: bytes.byteLength,
    head: bytes.subarray(0, EVIDENCE_SIGNATURE_BYTES),
  });
  if (!check.ok) throw await fail(rejected([{ index: 0, code: check.code }]));
  const { kind, mimeType } = check.evidence;

  // Copia sin EXIF, GPS ni otros metadatos (DoD, punto 4).
  let cleaned: Uint8Array;
  try {
    cleaned = await (options.reencode ?? reencodeEvidenceImage)(bytes, kind);
  } catch {
    throw await fail(
      rejected([{ index: 0, code: 'EVIDENCE_CONTENT_MISMATCH' }]),
    );
  }
  const recheck = validateEvidenceFile({
    name,
    type: mimeType,
    size: cleaned.byteLength,
    head: cleaned.subarray(0, EVIDENCE_SIGNATURE_BYTES),
  });
  if (!recheck.ok)
    throw await fail(rejected([{ index: 0, code: recheck.code }]));

  const evidenceId = (options.newId ?? randomUUID)();
  const finalPath = objectPath(userId, context.reportId, evidenceId, kind);
  const { error: uploadError } = await bucket.upload(finalPath, cleaned, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) throw await fail(storageFailed());

  const { data: row, error: insertError } = await client
    .from('report_evidences')
    .insert({
      id: evidenceId,
      report_id: context.reportId,
      uploaded_by: userId,
      storage_path: finalPath,
      original_name: name,
      mime_type: mimeType,
      size_bytes: cleaned.byteLength,
      sha256: createHash('sha256').update(cleaned).digest('hex'),
    })
    .select(RESOURCE_COLUMNS)
    .single<EvidenceRow>();
  if (insertError || !row) {
    const { code, message } = (insertError ?? {}) as {
      code?: string;
      message?: string;
    };
    const error =
      code === '23514' && message?.includes('EVIDENCE_TOO_MANY')
        ? rejected([{ index: null, code: 'EVIDENCE_TOO_MANY' }])
        : code === '23505'
          ? new EvidenceApiError(
              409,
              'EVIDENCE_DUPLICATE',
              'Esta imagen ya está asociada al reporte.',
            )
          : persistenceFailed();
    throw await fail(error, [finalPath, rawPath]);
  }

  await removeObjects(client, [rawPath], logError);
  const evidence = toResource(row);

  // HU-06/T5: aquí se recalculará la credibilidad del reporte.
  if (options.onEvidenceSaved) {
    try {
      await options.onEvidenceSaved(evidence);
    } catch (error) {
      logError(`Fallo tras guardar la evidencia ${evidence.id}`, error);
    }
  }
  return { evidence };
}

/** Evidencias del reporte que la RLS deja leer, con URL firmadas de lectura. */
export async function listReportEvidences(
  context: ListContext,
  options: EvidenceServiceOptions = {},
): Promise<{ items: EvidenceListItem[]; nextCursor: string | null }> {
  const { client } = await authorize(context, options, false);

  let limit = DEFAULT_LIST_LIMIT;
  const rawLimit = context.searchParams.get('limit')?.trim();
  if (rawLimit) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
      throw invalidRequest(
        `"limit" debe ser un entero entre 1 y ${MAX_LIST_LIMIT}.`,
      );
    }
  }
  let cursor: { createdAt: string; id: string } | null = null;
  const rawCursor = context.searchParams.get('cursor')?.trim();
  if (rawCursor) {
    try {
      cursor = decodeCursor(rawCursor);
    } catch {
      throw invalidRequest('El cursor de paginación no es válido.');
    }
  }

  let query = client
    .from('report_evidences')
    .select(`${RESOURCE_COLUMNS}, storage_path`)
    .eq('report_id', context.reportId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  if (error) throw persistenceFailed();

  const rows = (data ?? []) as EvidenceRow[];
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null;
  if (page.length === 0) return { items: [], nextCursor };

  const { data: signed, error: signError } = await client.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrls(
      page.map((row) => row.storage_path ?? ''),
      EVIDENCE_SIGNED_URL_SECONDS,
    );
  if (signError || !signed) throw storageFailed();

  const now = (options.now ?? (() => new Date()))();
  const urlExpiresAt = new Date(
    now.getTime() + EVIDENCE_SIGNED_URL_SECONDS * 1000,
  ).toISOString();
  return {
    items: page.map((row, index) => ({
      ...toResource(row),
      url: signed[index]?.signedUrl ?? '',
      urlExpiresAt,
    })),
    nextCursor,
  };
}

/** Ejecuta una operación y la traduce al formato de respuesta de la API. */
export async function runEvidenceOperation(
  successStatus: number,
  operation: () => Promise<unknown>,
  logError: (message: string, error: unknown) => void = defaultLogError,
): Promise<{ status: number; body: unknown }> {
  try {
    return { status: successStatus, body: await operation() };
  } catch (error) {
    if (error instanceof EvidenceApiError) {
      return {
        status: error.status,
        body: {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        },
      };
    }
    if (error instanceof SupabaseConfigurationError) {
      return {
        status: 503,
        body: {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message:
              'El servicio de base de datos no está configurado en el servidor.',
          },
        },
      };
    }
    logError('Error inesperado en la API de evidencias', error);
    return {
      status: 500,
      body: {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error inesperado al procesar la evidencia.',
        },
      },
    };
  }
}
