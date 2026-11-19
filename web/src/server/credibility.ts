import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from './supabase';

/**
 * Credibilidad de reportes (HU-09/T2). Diseño y batería de casos en
 * docs/domain-design.md, «Credibilidad de reportes (HU-09)».
 *
 * La base de datos devuelve solo agregados por reporte
 * (`public.report_credibility_inputs`, que aplica las reglas de las entradas)
 * y toda la fórmula vive aquí. Se recalcula siempre desde el estado completo:
 * no hay caché, incrementos ni escrituras.
 */

/** Peso mínimo de un valorador (`trust_level` = 1). */
export const WEIGHT_FLOOR = 0.25;
/** Aportación de cada evidencia visible a la masa a favor. */
export const EVIDENCE_WEIGHT = 0.25;
/** Tope de la masa de las evidencias (4 evidencias). */
export const EVIDENCE_CAP = 1.0;
/** Peso de cada uno de los dos votos ficticios neutrales. */
export const NEUTRAL_PRIOR = 1;
/** Puntuación a partir de la cual el nivel es alto (con datos suficientes). */
export const HIGH_SCORE_THRESHOLD = 70;
/** Puntuación por debajo de la cual el nivel es bajo (con datos suficientes). */
export const LOW_SCORE_THRESHOLD = 40;
/** Valoradores distintos necesarios para tener datos suficientes. */
export const MIN_ASSESSORS = 2;
/** Masa total (P + N) necesaria para tener datos suficientes. */
export const MIN_MASS = 1.0;
/** Tolerancia de coma flotante en la comparación con `MIN_MASS`. */
export const MASS_TOLERANCE = 1e-9;
/** Máximo de reportes por consulta (el `limit` máximo de GET /api/reports). */
export const MAX_REPORT_IDS = 100;
/** Escala de `profiles.trust_level`. */
export const MIN_TRUST_LEVEL = 1;
export const MAX_TRUST_LEVEL = 100;

const INPUTS_RPC = 'report_credibility_inputs';
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecalculateContext {
  cause:
    | 'evidence_added'
    | 'evidence_moderated'
    | 'validation_added'
    | 'manual_recalc';
  triggerId?: string;
}

export interface CredibilityFactors {
  /** E (antes del tope). */
  visibleEvidences: number;
  /** Valoraciones 'validate' que cuentan. */
  validations: number;
  /** Valoraciones 'invalidate' que cuentan. */
  invalidations: number;
  /** validations + invalidations. */
  assessors: number;
  /** P, redondeado a 2 decimales. */
  supportWeight: number;
  /** N, redondeado a 2 decimales. */
  againstWeight: number;
}

export interface CredibilityResult {
  /** 0-100. */
  score: number;
  level: 'low' | 'medium' | 'high';
  updatedAt: string;
  /** Si es `false`, `level` es `medium` en el sentido de «indeterminado». */
  sufficientData?: boolean;
  factors?: CredibilityFactors;
}

/** Agregados de un reporte, en el formato de `computeCredibility`. */
export interface CredibilityInputs {
  reportCreatedAt: string;
  visibleEvidences: number;
  latestEvidenceAt: string | null;
  validations: number;
  validationTrustSum: number;
  invalidations: number;
  invalidationTrustSum: number;
  latestAssessmentAt: string | null;
}

export type CredibilityErrorCode =
  /** Identificador o lista de identificadores no válidos. */
  | 'INVALID_INPUT'
  /** El reporte no existe o quien llama no puede verlo. */
  | 'NOT_FOUND'
  /** Configuración, red o RPC no disponibles. */
  | 'UNAVAILABLE'
  /** La RPC devolvió agregados mal formados o incoherentes. */
  | 'INVALID_AGGREGATES';

/** Error tipado: quien lo reciba no debe inventar una credibilidad. */
export class CredibilityError extends Error {
  constructor(
    readonly code: CredibilityErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'CredibilityError';
  }
}

export interface CredibilityServiceOptions {
  /** Cliente ya creado; por defecto, uno sin sesión (los agregados son públicos). */
  client?: SupabaseClient;
  logError?: (message: string, error: unknown) => void;
}

function defaultLogError(message: string, error: unknown) {
  console.error(message, error);
}

function invalidAggregates(detail: string): CredibilityError {
  return new CredibilityError(
    'INVALID_AGGREGATES',
    `Agregados de credibilidad incoherentes: ${detail}.`,
  );
}

function checkCount(name: string, value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalidAggregates(`${name} debe ser un entero no negativo`);
  }
}

function checkTrustSum(name: string, count: number, total: number) {
  if (
    !Number.isSafeInteger(total) ||
    total < MIN_TRUST_LEVEL * count ||
    total > MAX_TRUST_LEVEL * count
  ) {
    throw invalidAggregates(`${name} fuera de [n, 100·n]`);
  }
}

function parseDate(name: string, value: string): number {
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw invalidAggregates(`${name} no es una fecha`);
  return time;
}

/** Fecha opcional que debe existir si y solo si hay entradas de ese tipo. */
function optionalDate(
  name: string,
  value: string | null,
  present: boolean,
): number | null {
  if ((value !== null) !== present) {
    throw invalidAggregates(`${name} no concuerda con su recuento`);
  }
  return value === null ? null : parseDate(name, value);
}

/** Σw de n valoraciones con suma de confianza t: la fórmula es afín en t. */
function weightSum(count: number, trustSum: number): number {
  return (
    WEIGHT_FLOOR * count +
    ((1 - WEIGHT_FLOOR) * (trustSum - count)) /
      (MAX_TRUST_LEVEL - MIN_TRUST_LEVEL)
  );
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Función pura: mismas entradas, mismo resultado. Rechaza agregados
 * incoherentes con `INVALID_AGGREGATES` en lugar de corregirlos.
 */
export function computeCredibility(
  inputs: CredibilityInputs,
): CredibilityResult {
  checkCount('visibleEvidences', inputs.visibleEvidences);
  checkCount('validations', inputs.validations);
  checkCount('invalidations', inputs.invalidations);
  checkTrustSum(
    'validationTrustSum',
    inputs.validations,
    inputs.validationTrustSum,
  );
  checkTrustSum(
    'invalidationTrustSum',
    inputs.invalidations,
    inputs.invalidationTrustSum,
  );

  const assessors = inputs.validations + inputs.invalidations;
  const createdAt = parseDate('reportCreatedAt', inputs.reportCreatedAt);
  const evidenceAt = optionalDate(
    'latestEvidenceAt',
    inputs.latestEvidenceAt,
    inputs.visibleEvidences > 0,
  );
  const assessmentAt = optionalDate(
    'latestAssessmentAt',
    inputs.latestAssessmentAt,
    assessors > 0,
  );

  const support =
    weightSum(inputs.validations, inputs.validationTrustSum) +
    Math.min(EVIDENCE_WEIGHT * inputs.visibleEvidences, EVIDENCE_CAP);
  const against = weightSum(inputs.invalidations, inputs.invalidationTrustSum);

  const raw =
    (100 * (support + NEUTRAL_PRIOR)) / (support + against + 2 * NEUTRAL_PRIOR);
  const score = Math.min(100, Math.max(0, Math.round(raw)));

  const sufficientData =
    assessors >= MIN_ASSESSORS &&
    support + against >= MIN_MASS - MASS_TOLERANCE;
  const level: CredibilityResult['level'] = !sufficientData
    ? 'medium'
    : score >= HIGH_SCORE_THRESHOLD
      ? 'high'
      : score < LOW_SCORE_THRESHOLD
        ? 'low'
        : 'medium';

  // La entrada contada más reciente o, si no hay ninguna, la creación del
  // reporte. Determinista: no usa el reloj.
  const dated = [evidenceAt, assessmentAt].filter((t) => t !== null);
  const updatedAt = new Date(
    dated.length > 0 ? Math.max(...dated) : createdAt,
  ).toISOString();

  return {
    score,
    level,
    updatedAt,
    sufficientData,
    factors: {
      visibleEvidences: inputs.visibleEvidences,
      validations: inputs.validations,
      invalidations: inputs.invalidations,
      assessors,
      supportWeight: round2(support),
      againstWeight: round2(against),
    },
  };
}

function invalidInput(message: string): CredibilityError {
  return new CredibilityError('INVALID_INPUT', message);
}

function normalizeId(reportId: unknown): string {
  if (typeof reportId !== 'string' || !UUID_REGEX.test(reportId)) {
    throw invalidInput('Los identificadores de reporte deben ser UUID.');
  }
  return reportId.toLowerCase();
}

function normalizeIds(reportIds: unknown): string[] {
  if (!Array.isArray(reportIds)) {
    throw invalidInput('Se esperaba una lista de identificadores de reporte.');
  }
  const ids = [...new Set(reportIds.map(normalizeId))];
  if (ids.length > MAX_REPORT_IDS) {
    throw invalidInput(`Como mucho ${MAX_REPORT_IDS} reportes por consulta.`);
  }
  return ids;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function field<T extends 'string' | 'number'>(
  row: Record<string, unknown>,
  name: string,
  type: T,
  nullable = false,
): T extends 'string' ? string : number {
  const value = row[name];
  if (typeof value === type || (nullable && value === null)) {
    return value as T extends 'string' ? string : number;
  }
  throw invalidAggregates(`${name} tiene un tipo inesperado`);
}

/** Convierte una fila de la RPC (snake_case) en entradas validadas. */
function toInputs(row: unknown): {
  reportId: string;
  inputs: CredibilityInputs;
} {
  if (!isRecord(row)) throw invalidAggregates('fila mal formada');
  return {
    reportId: field(row, 'report_id', 'string'),
    inputs: {
      reportCreatedAt: field(row, 'report_created_at', 'string'),
      visibleEvidences: field(row, 'visible_evidences', 'number'),
      latestEvidenceAt: field(row, 'latest_evidence_at', 'string', true),
      validations: field(row, 'validations', 'number'),
      validationTrustSum: field(row, 'validation_trust_sum', 'number'),
      invalidations: field(row, 'invalidations', 'number'),
      invalidationTrustSum: field(row, 'invalidation_trust_sum', 'number'),
      latestAssessmentAt: field(row, 'latest_assessment_at', 'string', true),
    },
  };
}

async function fetchCredibility(
  ids: string[],
  client: SupabaseClient | undefined,
): Promise<Map<string, CredibilityResult>> {
  const results = new Map<string, CredibilityResult>();
  if (ids.length === 0) return results;

  let data: unknown;
  try {
    const response = await (client ?? createServerSupabaseClient()).rpc(
      INPUTS_RPC,
      { report_ids: ids },
    );
    if (response.error) throw response.error;
    data = response.data;
  } catch (error) {
    throw new CredibilityError(
      'UNAVAILABLE',
      'No se pudo consultar la credibilidad.',
      { cause: error },
    );
  }

  if (!Array.isArray(data)) throw invalidAggregates('respuesta mal formada');
  const requested = new Set(ids);
  for (const row of data) {
    const { reportId, inputs } = toInputs(row);
    if (!requested.has(reportId) || results.has(reportId)) {
      throw invalidAggregates(`reporte inesperado o repetido ${reportId}`);
    }
    results.set(reportId, computeCredibility(inputs));
  }
  return results;
}

/**
 * Calcula la credibilidad actual de un reporte. Es idempotente: obtiene los
 * agregados, calcula y devuelve; no escribe nada. `context` solo se usa para
 * registrar la causa de un fallo y no cambia el resultado.
 *
 * Quien lo invoque tras guardar algo (HU-06/T5, HU-08/T4) debe hacerlo dentro
 * de un try/catch que no cambie su respuesta: el fallo ya queda registrado.
 */
export async function recalculateReportCredibility(
  reportId: string,
  context?: RecalculateContext,
  options: CredibilityServiceOptions = {},
): Promise<CredibilityResult> {
  try {
    const id = normalizeId(reportId);
    const result = (await fetchCredibility([id], options.client)).get(id);
    if (!result) {
      throw new CredibilityError(
        'NOT_FOUND',
        'El reporte no existe o no está disponible.',
      );
    }
    return result;
  } catch (error) {
    const cause = context
      ? `${context.cause}${context.triggerId ? ` (${context.triggerId})` : ''}`
      : 'sin causa';
    (options.logError ?? defaultLogError)(
      `No se pudo calcular la credibilidad del reporte ${String(reportId)} [${cause}]`,
      error,
    );
    throw error;
  }
}

/**
 * Credibilidad de varios reportes con una sola RPC (HU-01/T7). Devuelve un
 * `Map` por identificador en minúsculas; los reportes inexistentes o que
 * quien llama no puede ver no aparecen. Sin registro propio: decide quien llama.
 */
export async function getReportsCredibility(
  reportIds: readonly string[],
  options: Pick<CredibilityServiceOptions, 'client'> = {},
): Promise<Map<string, CredibilityResult>> {
  return fetchCredibility(normalizeIds(reportIds), options.client);
}
