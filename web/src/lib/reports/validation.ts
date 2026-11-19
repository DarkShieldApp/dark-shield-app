export const REPORT_CATEGORY_VALUES = [
  'roach_motel',
  'hidden_costs',
  'false_urgency',
  'sneaking',
  'confirmshaming',
  'trick_questions',
  'other',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORY_VALUES)[number];

export interface ReportFormInput {
  targetUrl: string;
  category: string;
  title: string;
  description: string;
  stepsToReproduce: string;
}

export type ReportFieldName = keyof ReportFormInput;

export type ReportValidationErrors = Partial<Record<ReportFieldName, string>>;

export interface ReportValidationResult {
  valid: boolean;
  errors: ReportValidationErrors;
}

const TITLE_MIN_LENGTH = 5;
const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MIN_LENGTH = 15;
const DESCRIPTION_MAX_LENGTH = 2000;
const STEPS_MIN_LENGTH = 10;
const STEPS_MAX_LENGTH = 2000;

function isAllowedCategory(value: string): value is ReportCategory {
  return (REPORT_CATEGORY_VALUES as readonly string[]).includes(value);
}

export function validateTargetUrl(rawUrl: string): string | undefined {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return 'La URL de la página afectada es obligatoria.';
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Introduce una URL válida (por ejemplo, https://ejemplo.com/ruta).';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'La URL debe empezar por http:// o https://.';
  }

  if (!parsed.hostname || !parsed.hostname.includes('.')) {
    return 'Introduce un dominio válido en la URL.';
  }

  if (parsed.username || parsed.password) {
    return 'La URL no puede contener usuario ni contraseña incrustados.';
  }

  return undefined;
}

export function validateReportField(
  field: ReportFieldName,
  value: string,
): string | undefined {
  const trimmed = value.trim();

  switch (field) {
    case 'targetUrl':
      return validateTargetUrl(value);

    case 'category':
      if (!trimmed) {
        return 'Selecciona una categoría de Dark Pattern.';
      }
      if (!isAllowedCategory(trimmed)) {
        return 'La categoría seleccionada no es válida.';
      }
      return undefined;

    case 'title':
      if (!trimmed) {
        return 'El título breve del reporte es obligatorio.';
      }
      if (trimmed.length < TITLE_MIN_LENGTH) {
        return `El título debe tener al menos ${TITLE_MIN_LENGTH} caracteres.`;
      }
      if (trimmed.length > TITLE_MAX_LENGTH) {
        return `El título no puede superar los ${TITLE_MAX_LENGTH} caracteres.`;
      }
      return undefined;

    case 'description':
      if (!trimmed) {
        return 'La descripción del patrón detectado es obligatoria.';
      }
      if (trimmed.length < DESCRIPTION_MIN_LENGTH) {
        return `La descripción debe tener al menos ${DESCRIPTION_MIN_LENGTH} caracteres.`;
      }
      if (trimmed.length > DESCRIPTION_MAX_LENGTH) {
        return `La descripción no puede superar los ${DESCRIPTION_MAX_LENGTH} caracteres.`;
      }
      return undefined;

    case 'stepsToReproduce':
      if (!trimmed) {
        return 'Los pasos para reproducir el patrón son obligatorios.';
      }
      if (trimmed.length < STEPS_MIN_LENGTH) {
        return `Indica al menos ${STEPS_MIN_LENGTH} caracteres explicando los pasos.`;
      }
      if (trimmed.length > STEPS_MAX_LENGTH) {
        return `Los pasos no pueden superar los ${STEPS_MAX_LENGTH} caracteres.`;
      }
      return undefined;
  }
}

export function validateReportForm(
  input: ReportFormInput,
): ReportValidationResult {
  const fields: readonly ReportFieldName[] = [
    'targetUrl',
    'category',
    'title',
    'description',
    'stepsToReproduce',
  ];

  const errors: ReportValidationErrors = {};

  for (const field of fields) {
    const message = validateReportField(field, input[field]);
    if (message) {
      errors[field] = message;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
