import 'server-only';

import sharp from 'sharp';
import type { EvidenceKind } from '../lib/evidences/rules';

/**
 * Máximo de píxeles que se decodifican (unos 8000 × 5000). Protege frente a
 * imágenes pequeñas en bytes que se expanden en memoria al decodificarlas.
 */
export const EVIDENCE_MAX_INPUT_PIXELS = 40_000_000;

export class EvidenceImageError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('La imagen no se puede procesar.', options);
    this.name = 'EvidenceImageError';
  }
}

/**
 * Recodifica la evidencia en su mismo formato para eliminar los metadatos
 * personales (EXIF, GPS, XMP, IPTC y comentarios; DoD, punto 4). Aplica antes
 * la orientación EXIF a los píxeles para que la imagen se vea igual.
 */
export async function reencodeEvidenceImage(
  bytes: Uint8Array,
  kind: EvidenceKind,
): Promise<Uint8Array> {
  try {
    const image = sharp(bytes, {
      failOn: 'error',
      limitInputPixels: EVIDENCE_MAX_INPUT_PIXELS,
    }).rotate();
    const encoded =
      kind === 'png'
        ? image.png()
        : kind === 'jpeg'
          ? image.jpeg({ quality: 90, mozjpeg: true })
          : image.webp({ quality: 90 });
    return new Uint8Array(await encoded.toBuffer());
  } catch (cause) {
    throw new EvidenceImageError({ cause });
  }
}
