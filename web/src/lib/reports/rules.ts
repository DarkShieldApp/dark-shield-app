export interface ReportDraft {
  pageUrl: string;
  pattern: string;
  description: string;
}

export interface PreparedReport extends ReportDraft {
  pageUrl: string;
  pattern: string;
  description: string;
}

export type ReportDraftResult =
  | { ok: true; report: PreparedReport }
  | { ok: false; errors: Partial<Record<keyof ReportDraft, string>> };

/** Validación de cliente para HU-05; no persiste ni acredita un reporte. */
export function prepareReportDraft(draft: ReportDraft): ReportDraftResult {
  const errors: Partial<Record<keyof ReportDraft, string>> = {};
  const pageUrl = draft.pageUrl.trim();
  const pattern = draft.pattern.trim();
  const description = draft.description.trim();

  if (!pageUrl) errors.pageUrl = 'Indica la URL de la página afectada.';
  else {
    try {
      const url = new URL(pageUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        errors.pageUrl = 'Usa una dirección web HTTP o HTTPS.';
      }
    } catch {
      errors.pageUrl =
        'Introduce una URL válida, por ejemplo https://ejemplo.com.';
    }
  }
  if (!pattern) errors.pattern = 'Selecciona o escribe el patrón observado.';
  if (description.length < 20)
    errors.description = 'Describe lo observado con al menos 20 caracteres.';
  if (description.length > 2000)
    errors.description = 'La descripción no puede superar los 2000 caracteres.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, report: { pageUrl, pattern, description } };
}
