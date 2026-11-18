import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  validateReportForm,
  type ReportCategory,
  type ReportFormInput,
  type ReportValidationErrors,
} from '../lib/reports/validation';
import { getSupabaseConfig } from '../lib/supabase/config';

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
