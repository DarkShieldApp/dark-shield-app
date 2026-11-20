/**
 * Selección de evidencias en el cliente (HU-06/T3).
 *
 * Módulo puro: sin React, Next.js ni Supabase. Convierte archivos del navegador
 * en `EvidenceCandidate`, mantiene una selección acumulada sin duplicados y
 * clasifica cada archivo con las reglas de `rules.ts`, sin duplicarlas. El
 * cliente solo anticipa el rechazo: el servidor (HU-06/T4) vuelve a validar.
 */
import {
  ALLOWED_EVIDENCE_TYPES,
  EVIDENCE_MAX_FILE_BYTES,
  EVIDENCE_MAX_FILES,
  EVIDENCE_SIGNATURE_BYTES,
  validateEvidenceBatch,
  validateEvidenceFile,
  type AcceptedEvidence,
  type EvidenceBatchResult,
  type EvidenceCandidate,
  type EvidenceErrorCode,
} from './rules';

/** Archivo preparado: el original, su candidato y su clave de deduplicación. */
export interface PreparedEvidenceFile<F extends Blob = File> {
  key: string;
  file: F;
  candidate: EvidenceCandidate;
}

export type EvidenceSelectionItem<F extends Blob = File> =
  PreparedEvidenceFile<F> &
    (
      | { status: 'accepted'; evidence: AcceptedEvidence }
      | { status: 'rejected'; code: EvidenceErrorCode }
    );

/** Estado inmutable de la selección, en el orden en que se eligieron. */
export interface EvidenceSelection<F extends Blob = File> {
  readonly items: readonly EvidenceSelectionItem<F>[];
}

export const EMPTY_EVIDENCE_SELECTION: EvidenceSelection<never> = {
  items: [],
};

const MEBIBYTE = 1024 * 1024;

// La lista blanca de rules.ts tiene varios tipos: «PNG, JPG, JPEG o WEBP».
const ALLOWED_EXTENSION_LABELS = ALLOWED_EVIDENCE_TYPES.flatMap(
  ({ extensions }) => extensions.map((extension) => extension.toUpperCase()),
);
const ALLOWED_EXTENSIONS = `${ALLOWED_EXTENSION_LABELS.slice(0, -1).join(', ')} o ${ALLOWED_EXTENSION_LABELS.at(-1)}`;

/** Mensajes para el usuario; el tipo obliga a cubrir todos los códigos. */
export const EVIDENCE_ERROR_MESSAGES: Record<EvidenceErrorCode, string> = {
  EVIDENCE_NAME_INVALID:
    'El nombre del archivo no es válido. Renómbralo sin rutas, puntos al principio o al final ni caracteres especiales.',
  EVIDENCE_EMPTY: 'El archivo está vacío.',
  EVIDENCE_TOO_LARGE: `El archivo supera el tamaño máximo de ${EVIDENCE_MAX_FILE_BYTES / MEBIBYTE} MB.`,
  EVIDENCE_TYPE_NOT_ALLOWED: `Tipo de archivo no permitido. Solo se admiten ${ALLOWED_EXTENSIONS}, sin dobles extensiones.`,
  EVIDENCE_CONTENT_MISMATCH:
    'El contenido del archivo no corresponde a su extensión o a su tipo.',
  EVIDENCE_TOO_MANY: `Solo se pueden aportar ${EVIDENCE_MAX_FILES} archivos por envío. Quita alguno para añadir este.`,
};

/**
 * Lee del archivo solo lo necesario: tamaño y los primeros
 * `EVIDENCE_SIGNATURE_BYTES` bytes. Un `Blob` sin nombre queda con nombre
 * vacío para que las reglas lo rechacen.
 */
export async function readEvidenceCandidate(
  file: Blob,
  name: string = file instanceof File ? file.name : '',
): Promise<EvidenceCandidate> {
  const head = new Uint8Array(
    await file.slice(0, EVIDENCE_SIGNATURE_BYTES).arrayBuffer(),
  );
  return { name, type: file.type, size: file.size, head };
}

function selectionKey(file: Blob, candidate: EvidenceCandidate): string {
  const lastModified = file instanceof File ? file.lastModified : '';
  return [candidate.name, candidate.size, candidate.type, lastModified].join(
    '\u0000',
  );
}

export async function prepareEvidenceFiles<F extends Blob>(
  files: Iterable<F>,
): Promise<PreparedEvidenceFile<F>[]> {
  return Promise.all(
    Array.from(files, async (file) => {
      const candidate = await readEvidenceCandidate(file);
      return { key: selectionKey(file, candidate), file, candidate };
    }),
  );
}

/**
 * Clasifica en orden. El límite se aplica después de validar: solo cuentan
 * los aceptados, y un archivo válido que exceda el máximo queda rechazado con
 * `EVIDENCE_TOO_MANY` hasta que se libere un hueco.
 */
function classify<F extends Blob>(
  entries: readonly PreparedEvidenceFile<F>[],
): EvidenceSelection<F> {
  let accepted = 0;
  const items = entries.map(({ key, file, candidate }) => {
    const base = { key, file, candidate };
    const result = validateEvidenceFile(candidate);
    if (!result.ok) {
      return { ...base, status: 'rejected' as const, code: result.code };
    }
    if (accepted >= EVIDENCE_MAX_FILES) {
      return {
        ...base,
        status: 'rejected' as const,
        code: 'EVIDENCE_TOO_MANY' as const,
      };
    }
    accepted += 1;
    return {
      ...base,
      status: 'accepted' as const,
      evidence: result.evidence,
    };
  });
  return { items };
}

const toEntry = <F extends Blob>({
  key,
  file,
  candidate,
}: PreparedEvidenceFile<F>): PreparedEvidenceFile<F> => ({
  key,
  file,
  candidate,
});

/** Añade archivos a la selección; los ya presentes se devuelven como duplicados. */
export function addToEvidenceSelection<F extends Blob>(
  selection: EvidenceSelection<F>,
  prepared: readonly PreparedEvidenceFile<F>[],
): {
  selection: EvidenceSelection<F>;
  duplicates: PreparedEvidenceFile<F>[];
} {
  const entries = selection.items.map(toEntry);
  const keys = new Set(entries.map(({ key }) => key));
  const duplicates: PreparedEvidenceFile<F>[] = [];
  for (const entry of prepared) {
    if (keys.has(entry.key)) {
      duplicates.push(entry);
    } else {
      keys.add(entry.key);
      entries.push(entry);
    }
  }
  return { selection: classify(entries), duplicates };
}

export function removeFromEvidenceSelection<F extends Blob>(
  selection: EvidenceSelection<F>,
  key: string,
): EvidenceSelection<F> {
  const entries = selection.items.filter((item) => item.key !== key);
  return entries.length === selection.items.length
    ? selection
    : classify(entries.map(toEntry));
}

/**
 * Archivos que se enviarían y su validación como lote, igual que hará el
 * servidor. La subida HTTP no existe todavía: depende de HU-06/T1 y HU-11.
 */
export function evidenceSubmission<F extends Blob>(
  selection: EvidenceSelection<F>,
): { files: F[]; batch: EvidenceBatchResult } {
  const accepted = selection.items.filter((item) => item.status === 'accepted');
  return {
    files: accepted.map(({ file }) => file),
    batch: validateEvidenceBatch(accepted.map(({ candidate }) => candidate)),
  };
}
