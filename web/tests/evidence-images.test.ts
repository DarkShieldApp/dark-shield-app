import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));

import {
  EVIDENCE_MAX_INPUT_PIXELS,
  EvidenceImageError,
  reencodeEvidenceImage,
} from '../src/server/evidence-images';

// Imágenes reales generadas en memoria con metadatos personales: EXIF con
// autor, GPS (IFD3) y XMP. No se versionan binarios.
const XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Ana</dc:creator></rdf:Description>
</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

const PERSONAL_EXIF = {
  IFD0: { Artist: 'Ana García', Copyright: 'Ana' },
  IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '36/1 43/1 0/1' },
};

function base(width = 4, height = 2) {
  return sharp({
    create: { width, height, channels: 3, background: '#cc3300' },
  });
}

async function withMetadata(format: 'png' | 'jpeg' | 'webp') {
  const image = base().withExif(PERSONAL_EXIF).withXmp(XMP);
  const encoded =
    format === 'png'
      ? image.png()
      : format === 'jpeg'
        ? image.jpeg()
        : image.webp();
  return new Uint8Array(await encoded.toBuffer());
}

describe('recodificación de evidencias', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    'elimina EXIF, GPS y XMP de un %s y conserva el formato',
    async (format) => {
      const input = await withMetadata(format);
      const before = await sharp(input).metadata();
      expect(before.exif).toBeDefined();
      expect(before.xmp).toBeDefined();

      const output = await reencodeEvidenceImage(input, format);
      const after = await sharp(output).metadata();

      expect(after.format).toBe(format);
      expect(after.exif).toBeUndefined();
      expect(after.xmp).toBeUndefined();
      expect(after.iptc).toBeUndefined();
      expect([after.width, after.height]).toEqual([4, 2]);
    },
  );

  it('aplica la orientación EXIF a los píxeles antes de descartarla', async () => {
    const rotated = new Uint8Array(
      await base(4, 2).withMetadata({ orientation: 6 }).jpeg().toBuffer(),
    );
    expect((await sharp(rotated).metadata()).orientation).toBe(6);

    const after = await sharp(
      await reencodeEvidenceImage(rotated, 'jpeg'),
    ).metadata();

    expect(after.orientation).toBeUndefined();
    expect([after.width, after.height]).toEqual([2, 4]);
  });

  it('rechaza bytes que no se pueden decodificar', async () => {
    const corrupt = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3,
    ]);

    await expect(reencodeEvidenceImage(corrupt, 'png')).rejects.toBeInstanceOf(
      EvidenceImageError,
    );
  });

  it('rechaza imágenes con demasiados píxeles (bomba de descompresión)', async () => {
    expect(EVIDENCE_MAX_INPUT_PIXELS).toBe(40_000_000);
    const huge = new Uint8Array(
      await sharp({
        create: { width: 8000, height: 6000, channels: 3, background: '#fff' },
      })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    );

    await expect(reencodeEvidenceImage(huge, 'png')).rejects.toBeInstanceOf(
      EvidenceImageError,
    );
  });
});
