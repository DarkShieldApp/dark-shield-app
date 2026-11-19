import type { ReportCategory } from './validation';

export interface ReportCategoryOption {
  readonly value: ReportCategory;
  readonly label: string;
}

/**
 * Etiquetas legibles de las categorías de dark pattern. Las comparten el
 * formulario de creación (HU-05) y el resumen del listado (HU-01/T6).
 */
export const REPORT_CATEGORY_OPTIONS: readonly ReportCategoryOption[] = [
  {
    value: 'roach_motel',
    label: 'Suscripción difícil de cancelar (Roach Motel)',
  },
  {
    value: 'hidden_costs',
    label: 'Costes ocultos o cargos sorpresa (Hidden Costs)',
  },
  { value: 'false_urgency', label: 'Urgencia o escasez falsa (False Urgency)' },
  {
    value: 'sneaking',
    label: 'Preselección o elementos añadidos sin permiso (Sneaking)',
  },
  { value: 'confirmshaming', label: 'Manipulación emocional (Confirmshaming)' },
  {
    value: 'trick_questions',
    label: 'Interfaz o redacción confusa (Trick Questions)',
  },
  { value: 'other', label: 'Otro patrón oscuro' },
];

export const UNKNOWN_CATEGORY_LABEL = 'Categoría no especificada';

const LABELS = new Map<string, string>(
  REPORT_CATEGORY_OPTIONS.map(({ value, label }) => [value, label]),
);

/** Etiqueta legible de `pattern_type`; no inventa una para valores ajenos. */
export function getCategoryLabel(
  patternType: string | null | undefined,
): string {
  return (patternType && LABELS.get(patternType)) || UNKNOWN_CATEGORY_LABEL;
}
