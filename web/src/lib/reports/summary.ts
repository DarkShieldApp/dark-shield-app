import { getCategoryLabel } from './categories';
import type {
  ReportCredibilityLevel,
  ReportCredibilitySummary,
  ReportSummaryItem,
} from './query';

/**
 * Presentación del resumen de un reporte en el listado (HU-01/T6) y de su
 * estado de credibilidad (HU-01/T7). Solo transforma los campos públicos de
 * `GET /api/reports`; el detalle completo (HU-02) y la explicación de los
 * factores (HU-09/T3) quedan fuera.
 */

export const EXCERPT_MAX_LENGTH = 180;
export const STEPS_MARKER = 'Pasos para reproducir:';
export const COMMUNITY_NOTICE = 'Reporte comunitario, no es un veredicto';
export const CREDIBILITY_UNAVAILABLE = 'Credibilidad no disponible';
export const CREDIBILITY_INSUFFICIENT = 'Datos insuficientes';
export const CREDIBILITY_LEVEL_LABELS: Record<ReportCredibilityLevel, string> =
  { high: 'Alta', medium: 'Media', low: 'Baja' };
export const CREDIBILITY_DYNAMIC_NOTICE =
  'La credibilidad cambia con nuevas evidencias y valoraciones; no es una garantía';
export const UNTITLED_REPORT = 'Reporte sin título';
export const NO_DESCRIPTION = 'Sin descripción disponible.';
export const UNKNOWN_DATE = 'Fecha no disponible';

// Zona fija: la misma fecha para cualquier visitante y en las pruebas.
const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Madrid',
});

/** Fecha legible en es-ES, p. ej. «19 de noviembre de 2026». */
export function formatReportDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? UNKNOWN_DATE : DATE_FORMAT.format(date);
}

/** Página afectada sin query ni fragmento, aunque el servidor ya los quite. */
export function displayPageUrl(targetUrl: string): string {
  const trimmed = targetUrl.trim();
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return trimmed.replace(/[?#][\s\S]*$/, '');
  }
}

/**
 * Extracto de la descripción: descarta la sección «Pasos para reproducir:»
 * que añade la creación (HU-05), normaliza espacios y recorta por puntos de
 * código (no parte emojis ni pares sustitutos), preferiblemente en un espacio.
 */
export function buildExcerpt(
  description: string,
  maxLength: number = EXCERPT_MAX_LENGTH,
): string {
  const markerAt = description.indexOf(STEPS_MARKER);
  const body = (markerAt === -1 ? description : description.slice(0, markerAt))
    .replace(/\s+/g, ' ')
    .trim();

  const chars = Array.from(body);
  if (chars.length <= maxLength) return body;

  let cut = chars.slice(0, maxLength).join('');
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace >= maxLength * 0.6) cut = cut.slice(0, lastSpace);
  return `${cut.replace(/[\s.,;:¡!¿?…-]+$/u, '')}…`;
}

export type CredibilityStatus =
  'unavailable' | 'insufficient' | ReportCredibilityLevel;

export interface CredibilityView {
  /** Estado para estilos y para ampliar la explicación (HU-09/T3). */
  status: CredibilityStatus;
  /** Texto visible: el estado nunca se comunica solo con color. */
  label: string;
}

/**
 * Etiqueta del estado de credibilidad (HU-01/T7, reutilizable en HU-09/T3).
 * Sin valor no se infiere nada. Sin datos suficientes confirmados
 * (`sufficientData` distinto de `true`) es «Datos insuficientes», nunca un
 * nivel, aunque `level` traiga otro valor. La puntuación no forma parte de la
 * etiqueta: no es un veredicto.
 */
export function describeCredibility(
  credibility: ReportCredibilitySummary | null | undefined,
): CredibilityView {
  if (!credibility) {
    return { status: 'unavailable', label: CREDIBILITY_UNAVAILABLE };
  }
  if (credibility.sufficientData !== true) {
    return { status: 'insufficient', label: CREDIBILITY_INSUFFICIENT };
  }
  return {
    status: credibility.level,
    label: CREDIBILITY_LEVEL_LABELS[credibility.level],
  };
}

export interface ReportSummaryView {
  id: string;
  title: string;
  categoryLabel: string;
  pageUrl: string;
  dateTime: string;
  dateLabel: string;
  excerpt: string;
  credibility: CredibilityView;
}

export function toReportSummaryView(
  item: ReportSummaryItem,
): ReportSummaryView {
  return {
    id: item.id,
    title: item.title.trim() || UNTITLED_REPORT,
    categoryLabel: getCategoryLabel(item.pattern_type),
    pageUrl: displayPageUrl(item.target_url),
    dateTime: item.created_at,
    dateLabel: formatReportDate(item.created_at),
    excerpt: buildExcerpt(item.description) || NO_DESCRIPTION,
    credibility: describeCredibility(item.credibility),
  };
}
