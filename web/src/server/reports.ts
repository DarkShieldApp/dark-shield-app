import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  validateReportForm,
  type ReportCategory,
  type ReportFormInput,
  type ReportValidationErrors,
} from '../lib/reports/validation';
import {
  QUERY_ERROR_CODES,
  type ReportQueryResult,
  type ReportQueryScope,
  type ReportSummaryItem,
} from '../lib/reports/query';
import { getSupabaseConfig } from '../lib/supabase/config';
import { createServerSupabaseClient } from './supabase';

export interface PersistedReport {
  id: string;
  author_id: string;
  title: string;
  description: string;
  pattern_type: ReportCategory | null;
  target_url: string;
  page_key: string;
  target_host: string;
  registrable_domain: string;
  created_at: string;
}

export interface NormalizedReportTarget {
  targetUrl: string;
  pageKey: string;
  targetHost: string;
  registrableDomain: string;
}

export class ReportApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ReportValidationErrors;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ReportValidationErrors,
  ) {
    super(message);
    this.name = 'ReportApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'com.br',
  'com.mx',
  'com.ar',
  'gob.es',
  'org.es',
  'edu.es',
  'nom.es',
]);

const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/;
const MAX_TARGET_URL_LENGTH = 2048;

export function extractRegistrableDomain(hostname: string): string {
  const normalized = hostname.toLowerCase().replace(/\.+$/, '');
  const labels = normalized.split('.').filter(Boolean);
  if (labels.length <= 2) {
    return normalized;
  }

  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART_PUBLIC_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }

  return lastTwo;
}

export function normalizeReportTarget(rawUrl: string): NormalizedReportTarget {
  const parsed = new URL(rawUrl.trim());
  const targetHost = parsed.hostname.toLowerCase();
  const pageKey = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  const registrableDomain = extractRegistrableDomain(targetHost);

  return {
    targetUrl: parsed.toString(),
    pageKey,
    targetHost,
    registrableDomain,
  };
}

function readStringField(
  source: Record<string, unknown>,
  primaryKey: string,
  fallbackKey?: string,
): string {
  const rawValue =
    source[primaryKey] !== undefined
      ? source[primaryKey]
      : fallbackKey
        ? source[fallbackKey]
        : undefined;

  if (rawValue === undefined || rawValue === null) {
    return '';
  }

  if (typeof rawValue !== 'string') {
    throw new ReportApiError(
      400,
      'INVALID_FIELD_TYPE',
      `El campo "${primaryKey}" debe ser una cadena de texto.`,
    );
  }

  return rawValue;
}

export function parseAndValidateReportPayload(
  rawBody: unknown,
): ReportFormInput {
  if (
    typeof rawBody !== 'object' ||
    rawBody === null ||
    Array.isArray(rawBody)
  ) {
    throw new ReportApiError(
      400,
      'INVALID_PAYLOAD',
      'El cuerpo de la petición debe ser un objeto JSON válido.',
    );
  }

  const record = rawBody as Record<string, unknown>;
  const input: ReportFormInput = {
    targetUrl: readStringField(record, 'targetUrl', 'target_url').trim(),
    category: readStringField(record, 'category', 'pattern_type').trim(),
    title: readStringField(record, 'title').trim(),
    description: readStringField(record, 'description').trim(),
    stepsToReproduce: readStringField(
      record,
      'stepsToReproduce',
      'steps_to_reproduce',
    ).trim(),
  };

  const validation = validateReportForm(input);
  if (!validation.valid) {
    throw new ReportApiError(
      400,
      'VALIDATION_ERROR',
      'Los datos del reporte contienen errores de validación.',
      validation.errors,
    );
  }

  if (CONTROL_CHARS_REGEX.test(input.title)) {
    throw new ReportApiError(
      400,
      'VALIDATION_ERROR',
      'El título no puede contener caracteres de control.',
      { title: 'El título no puede contener caracteres de control.' },
    );
  }

  const normalizedTarget = normalizeReportTarget(input.targetUrl);
  if (normalizedTarget.targetUrl.length > MAX_TARGET_URL_LENGTH) {
    throw new ReportApiError(
      400,
      'VALIDATION_ERROR',
      `La URL no puede superar los ${MAX_TARGET_URL_LENGTH} caracteres.`,
      {
        targetUrl: `La URL no puede superar los ${MAX_TARGET_URL_LENGTH} caracteres.`,
      },
    );
  }

  return input;
}

export function createAuthenticatedSupabaseClient(
  accessToken: string,
): SupabaseClient {
  const { url, publishableKey } = getSupabaseConfig();
  return createClient(url, publishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function createReport(
  rawBody: unknown,
  accessToken: string | null,
  injectedClient?: SupabaseClient,
): Promise<PersistedReport> {
  const input = parseAndValidateReportPayload(rawBody);

  const token = accessToken?.trim();
  if (!token) {
    throw new ReportApiError(
      401,
      'UNAUTHENTICATED',
      'Debes iniciar sesión como colaborador para registrar un reporte.',
    );
  }

  const client = injectedClient ?? createAuthenticatedSupabaseClient(token);

  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) {
    throw new ReportApiError(
      401,
      'INVALID_SESSION',
      'La sesión no es válida o ha caducado.',
    );
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, is_active')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError) {
    throw new ReportApiError(
      500,
      'PROFILE_LOOKUP_FAILED',
      'No se pudo comprobar el estado del perfil del colaborador.',
    );
  }

  if (!profile || !profile.is_active) {
    throw new ReportApiError(
      403,
      'FORBIDDEN_INACTIVE_PROFILE',
      'Tu cuenta de colaborador no está activa para crear reportes.',
    );
  }

  const targetMeta = normalizeReportTarget(input.targetUrl);
  const storedDescription = `${input.description}\n\nPasos para reproducir:\n${input.stepsToReproduce}`;

  const { data: created, error: insertError } = await client
    .from('reports')
    .insert({
      author_id: authData.user.id,
      title: input.title,
      description: storedDescription,
      pattern_type: input.category,
      target_url: targetMeta.targetUrl,
      page_key: targetMeta.pageKey,
      target_host: targetMeta.targetHost,
      registrable_domain: targetMeta.registrableDomain,
    })
    .select(
      'id, author_id, title, description, pattern_type, target_url, page_key, target_host, registrable_domain, created_at',
    )
    .single();

  if (insertError || !created) {
    throw new ReportApiError(
      500,
      'REPORT_PERSISTENCE_FAILED',
      'No se pudo guardar el reporte en la base de datos.',
    );
  }

  return created as PersistedReport;
}

export interface NormalizedReportQuery {
  target: string;
  scope: ReportQueryScope;
  limit: number;
  cursor: { createdAt: string; id: string } | null;
  lookupKey: string;
}

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64url');
}

export function decodeCursor(cursor: string): {
  createdAt: string;
  id: string;
} {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.createdAt === 'string' &&
      typeof parsed.id === 'string' &&
      parsed.createdAt.trim() !== '' &&
      parsed.id.trim() !== ''
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {}
  throw new ReportApiError(
    400,
    QUERY_ERROR_CODES.INVALID_CURSOR,
    'El cursor de paginación no es válido.',
  );
}

export function parseAndValidateQueryParams(
  rawParams: Record<string, unknown> | URLSearchParams,
): NormalizedReportQuery {
  const getParam = (key: string): string => {
    if (rawParams instanceof URLSearchParams) {
      return rawParams.get(key) ?? '';
    }
    const val = rawParams[key];
    if (typeof val === 'number') {
      return String(val);
    }
    return typeof val === 'string' ? val : '';
  };

  const rawScope = getParam('scope').trim().toLowerCase();
  if (rawScope !== 'page' && rawScope !== 'domain') {
    throw new ReportApiError(
      400,
      QUERY_ERROR_CODES.INVALID_SCOPE,
      'El parámetro "scope" es obligatorio y debe ser "page" o "domain".',
    );
  }
  const scope: ReportQueryScope = rawScope;

  const rawTarget = getParam('target').trim();
  if (!rawTarget) {
    throw new ReportApiError(
      400,
      QUERY_ERROR_CODES.MISSING_TARGET,
      'El parámetro "target" es obligatorio.',
    );
  }

  if (
    rawTarget.length > MAX_TARGET_URL_LENGTH ||
    CONTROL_CHARS_REGEX.test(rawTarget)
  ) {
    throw new ReportApiError(
      400,
      QUERY_ERROR_CODES.INVALID_TARGET,
      'El parámetro "target" contiene caracteres de control o supera la longitud máxima permitida.',
    );
  }

  let lookupKey: string;

  if (scope === 'page') {
    let parsed: URL;
    try {
      parsed = new URL(rawTarget);
    } catch {
      throw new ReportApiError(
        400,
        QUERY_ERROR_CODES.INVALID_TARGET_URL,
        'Para scope=page, target debe ser una URL absoluta http o https válida.',
      );
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ReportApiError(
        400,
        QUERY_ERROR_CODES.INVALID_TARGET_URL,
        'El protocolo de la URL debe ser http o https.',
      );
    }

    if (parsed.username !== '' || parsed.password !== '') {
      throw new ReportApiError(
        400,
        QUERY_ERROR_CODES.INVALID_TARGET_URL,
        'La URL no puede contener credenciales de autenticación.',
      );
    }

    if (!parsed.hostname) {
      throw new ReportApiError(
        400,
        QUERY_ERROR_CODES.INVALID_TARGET_URL,
        'La URL debe incluir un nombre de host válido.',
      );
    }

    lookupKey = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } else {
    let rawHost = rawTarget;
    if (/^https?:\/\//i.test(rawTarget)) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawTarget);
      } catch {
        throw new ReportApiError(
          400,
          QUERY_ERROR_CODES.INVALID_TARGET_DOMAIN,
          'La URL proporcionada para búsqueda por dominio no es válida.',
        );
      }
      if (parsedUrl.username !== '' || parsedUrl.password !== '') {
        throw new ReportApiError(
          400,
          QUERY_ERROR_CODES.INVALID_TARGET_DOMAIN,
          'El dominio no puede contener credenciales.',
        );
      }
      rawHost = parsedUrl.hostname;
    } else {
      if (rawTarget.includes('@')) {
        throw new ReportApiError(
          400,
          QUERY_ERROR_CODES.INVALID_TARGET_DOMAIN,
          'El dominio no puede contener credenciales.',
        );
      }
      const firstPart = rawTarget.split('/')[0] ?? '';
      const hostPart = firstPart.split(':')[0] ?? '';
      rawHost = hostPart.trim();
    }

    const normalizedHost = rawHost.toLowerCase().replace(/\.+$/, '');

    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(normalizedHost);
    const isIpv6 =
      normalizedHost.includes(':') || /^[0-9a-f:]+$/i.test(normalizedHost);
    if (isIpv4 || isIpv6) {
      throw new ReportApiError(
        400,
        QUERY_ERROR_CODES.INVALID_TARGET_DOMAIN,
        'Las direcciones IP solo se admiten en consultas con scope=page.',
      );
    }

    const isSingleLabel = !normalizedHost.includes('.');
    const isKnownMultiPartSuffix =
      MULTI_PART_PUBLIC_SUFFIXES.has(normalizedHost);
    const isCommonSingleTld = [
      'com',
      'org',
      'net',
      'edu',
      'gov',
      'es',
      'uk',
      'io',
      'de',
      'fr',
      'it',
      'app',
      'dev',
    ].includes(normalizedHost);

    if (isSingleLabel || isKnownMultiPartSuffix || isCommonSingleTld) {
      throw new ReportApiError(
        400,
        QUERY_ERROR_CODES.INVALID_TARGET_DOMAIN,
        'El objetivo de búsqueda no puede ser únicamente un sufijo público.',
      );
    }

    if (
      !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(
        normalizedHost,
      )
    ) {
      throw new ReportApiError(
        400,
        QUERY_ERROR_CODES.INVALID_TARGET_DOMAIN,
        'El formato del dominio no es válido.',
      );
    }

    lookupKey = extractRegistrableDomain(normalizedHost);
  }

  let limit = 20;
  const rawLimit = getParam('limit').trim();
  if (rawLimit) {
    const parsedLimit = Number(rawLimit);
    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 100
    ) {
      throw new ReportApiError(
        400,
        QUERY_ERROR_CODES.INVALID_LIMIT,
        'El parámetro "limit" debe ser un número entero entre 1 y 100.',
      );
    }
    limit = parsedLimit;
  }

  let cursor: { createdAt: string; id: string } | null = null;
  const rawCursor = getParam('cursor').trim();
  if (rawCursor) {
    cursor = decodeCursor(rawCursor);
  }

  return {
    target: rawTarget,
    scope,
    limit,
    cursor,
    lookupKey,
  };
}

export async function queryReports(
  rawParams: Record<string, unknown> | URLSearchParams,
  injectedClient?: SupabaseClient,
): Promise<ReportQueryResult> {
  const query = parseAndValidateQueryParams(rawParams);
  const client = injectedClient ?? createServerSupabaseClient();

  let dbQuery = client
    .from('reports')
    .select(
      'id, title, description, pattern_type, target_url, page_key, created_at',
    )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(query.limit + 1);

  if (query.scope === 'page') {
    dbQuery = dbQuery.eq('page_key', query.lookupKey);
  } else {
    dbQuery = dbQuery.eq('registrable_domain', query.lookupKey);
  }

  if (query.cursor) {
    dbQuery = dbQuery.or(
      `created_at.lt.${query.cursor.createdAt},and(created_at.eq.${query.cursor.createdAt},id.lt.${query.cursor.id})`,
    );
  }

  const { data, error } = await dbQuery;

  if (error) {
    throw new ReportApiError(
      500,
      QUERY_ERROR_CODES.QUERY_FAILED,
      'Error al consultar los reportes en la base de datos.',
    );
  }

  const rows = data ?? [];

  // HU01-FL-03 — Diferenciar vacío de error:
  // Una página sin reportes devuelve un listado vacío con 200 OK, no un error
  if (rows.length === 0) {
    return {
      items: [],
      nextCursor: null,
    };
  }

  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;

  const items: ReportSummaryItem[] = pageRows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    pattern_type: row.pattern_type as string | null,
    target_url: row.target_url,
    page_key: row.page_key,
    created_at: row.created_at,
  }));

  const lastItem = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && lastItem ? encodeCursor(lastItem.created_at, lastItem.id) : null;

  return {
    items,
    nextCursor,
  };
}
