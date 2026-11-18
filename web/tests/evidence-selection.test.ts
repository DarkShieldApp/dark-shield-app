import { describe, expect, it, vi } from 'vitest';
import {
  EVIDENCE_ERROR_CODES,
  EVIDENCE_MAX_FILE_BYTES,
  EVIDENCE_MAX_FILES,
  EVIDENCE_SIGNATURE_BYTES,
} from '../src/lib/evidences/rules';
import {
  EMPTY_EVIDENCE_SELECTION,
  EVIDENCE_ERROR_MESSAGES,
  addToEvidenceSelection,
  evidenceSubmission,
  prepareEvidenceFiles,
  readEvidenceCandidate,
  removeFromEvidenceSelection,
  type EvidenceSelection,
} from '../src/lib/evidences/selection';

// Archivos reales del entorno (File/Blob de Node 24), construidos en memoria.
const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngFile(name: string, extraBytes = 64, lastModified = 1): File {
  const body = new Uint8Array(PNG_SIGNATURE.length + extraBytes);
  body.set(PNG_SIGNATURE);
  return new File([body], name, { type: 'image/png', lastModified });
}

function pdfFile(name: string): File {
  return new File([new Uint8Array(ascii('%PDF-1.7\n%...'))], name, {
    type: 'application/pdf',
    lastModified: 1,
  });
}

/** Un ejecutable renombrado: extensión y MIME de PNG, contenido distinto. */
function disguisedFile(name: string): File {
  return new File([new Uint8Array(ascii('MZ\u0090\u0000 cabecera PE'))], name, {
    type: 'image/png',
    lastModified: 1,
  });
}

async function selectionWith(
  files: File[],
  base: EvidenceSelection = EMPTY_EVIDENCE_SELECTION,
) {
  return addToEvidenceSelection(base, await prepareEvidenceFiles(files));
}

const statuses = (selection: EvidenceSelection) =>
  selection.items.map((item) =>
    item.status === 'accepted'
      ? `${item.file.name}:ok`
      : `${item.file.name}:${item.code}`,
  );

describe('conversión de un archivo en candidato', () => {
  it('toma nombre, tipo, tamaño y solo los primeros bytes de la firma', async () => {
    const file = pngFile('captura.png', 4096);
    const slice = vi.spyOn(file, 'slice');

    const candidate = await readEvidenceCandidate(file);

    expect(slice).toHaveBeenCalledTimes(1);
    expect(slice).toHaveBeenCalledWith(0, EVIDENCE_SIGNATURE_BYTES);
    expect(candidate).toEqual({
      name: 'captura.png',
      type: 'image/png',
      size: file.size,
      head: expect.any(Uint8Array),
    });
    expect(candidate.head).toHaveLength(EVIDENCE_SIGNATURE_BYTES);
    expect(Array.from(candidate.head.slice(0, 8))).toEqual(PNG_SIGNATURE);
  });

  it('no supera el tamaño real en archivos más cortos que la firma', async () => {
    const tiny = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'mini.jpg', {
      type: 'image/jpeg',
    });

    const candidate = await readEvidenceCandidate(tiny);

    expect(candidate.size).toBe(3);
    expect(Array.from(candidate.head)).toEqual([0xff, 0xd8, 0xff]);
  });

  it('admite un Blob con el nombre indicado por el llamador', async () => {
    const blob = new Blob([new Uint8Array(ascii('%PDF-1.4'))], {
      type: 'application/pdf',
    });

    expect(await readEvidenceCandidate(blob, 'informe.pdf')).toMatchObject({
      name: 'informe.pdf',
      type: 'application/pdf',
      size: 8,
    });
  });

  it('deja sin nombre un Blob anónimo para que las reglas lo rechacen', async () => {
    const blob = new Blob([new Uint8Array(PNG_SIGNATURE)], {
      type: 'image/png',
    });
    const selection = addToEvidenceSelection(
      EMPTY_EVIDENCE_SELECTION,
      await prepareEvidenceFiles([blob]),
    ).selection;

    expect((await readEvidenceCandidate(blob)).name).toBe('');
    expect(selection.items[0]).toMatchObject({
      status: 'rejected',
      code: EVIDENCE_ERROR_CODES.NAME_INVALID,
    });
  });

  it('no lee el contenido de un archivo vacío ni lo da por válido', async () => {
    const empty = new File([], 'vacio.png', { type: 'image/png' });
    const { selection } = await selectionWith([empty]);

    expect(selection.items[0]).toMatchObject({
      status: 'rejected',
      code: EVIDENCE_ERROR_CODES.EMPTY,
    });
  });
});

describe('resultado por archivo', () => {
  it('acepta los archivos válidos con el tipo normalizado', async () => {
    const { selection } = await selectionWith([
      pngFile('captura.png'),
      pdfFile('informe.pdf'),
    ]);

    expect(selection.items).toHaveLength(2);
    expect(selection.items[0]).toMatchObject({
      status: 'accepted',
      evidence: { kind: 'png', mimeType: 'image/png', extension: 'png' },
    });
    expect(selection.items[1]).toMatchObject({
      status: 'accepted',
      evidence: { kind: 'pdf' },
    });
  });

  it('rechaza cada archivo no válido con el código de rules.ts', async () => {
    const { selection } = await selectionWith([
      disguisedFile('foto.png'),
      pngFile('factura.pdf.exe'),
      pngFile('.oculto.png'),
      new File([new Uint8Array(EVIDENCE_MAX_FILE_BYTES + 1)], 'enorme.png', {
        type: 'image/png',
      }),
    ]);

    expect(statuses(selection)).toEqual([
      `foto.png:${EVIDENCE_ERROR_CODES.CONTENT_MISMATCH}`,
      `factura.pdf.exe:${EVIDENCE_ERROR_CODES.TYPE_NOT_ALLOWED}`,
      `.oculto.png:${EVIDENCE_ERROR_CODES.NAME_INVALID}`,
      `enorme.png:${EVIDENCE_ERROR_CODES.TOO_LARGE}`,
    ]);
  });

  it('conserva el orden de selección y da una clave estable a cada archivo', async () => {
    const { selection } = await selectionWith([
      pngFile('b.png'),
      pngFile('a.png'),
    ]);

    expect(selection.items.map((item) => item.file.name)).toEqual([
      'b.png',
      'a.png',
    ]);
    const keys = selection.items.map((item) => item.key);
    expect(new Set(keys).size).toBe(2);
    expect(
      (await selectionWith([pngFile('b.png'), pngFile('a.png')])).selection
        .items[0]?.key,
    ).toBe(keys[0]);
  });
});

describe('límite de archivos aplicado después de validar', () => {
  it('con seis archivos, uno rechazado, no pierde ninguno de los cinco válidos', async () => {
    const files = [
      disguisedFile('malicioso.png'),
      ...[1, 2, 3, 4, 5].map((n) => pngFile(`valida-${n}.png`)),
    ];

    const { selection } = await selectionWith(files);

    expect(selection.items).toHaveLength(6);
    expect(statuses(selection)).toEqual([
      `malicioso.png:${EVIDENCE_ERROR_CODES.CONTENT_MISMATCH}`,
      'valida-1.png:ok',
      'valida-2.png:ok',
      'valida-3.png:ok',
      'valida-4.png:ok',
      'valida-5.png:ok',
    ]);
    expect(evidenceSubmission(selection).files).toHaveLength(
      EVIDENCE_MAX_FILES,
    );
  });

  it('con seis archivos válidos, marca solo el sexto como excedente', async () => {
    const files = [1, 2, 3, 4, 5, 6].map((n) => pngFile(`valida-${n}.png`));

    const { selection } = await selectionWith(files);

    expect(statuses(selection)).toEqual([
      'valida-1.png:ok',
      'valida-2.png:ok',
      'valida-3.png:ok',
      'valida-4.png:ok',
      'valida-5.png:ok',
      `valida-6.png:${EVIDENCE_ERROR_CODES.TOO_MANY}`,
    ]);
  });

  it('acumula selecciones sucesivas y aplica el límite al conjunto', async () => {
    const first = await selectionWith([
      pngFile('a.png'),
      pngFile('b.png'),
      pngFile('c.png'),
    ]);
    const second = await selectionWith(
      [
        disguisedFile('x.png'),
        pngFile('d.png'),
        pngFile('e.png'),
        pngFile('f.png'),
      ],
      first.selection,
    );

    expect(statuses(second.selection)).toEqual([
      'a.png:ok',
      'b.png:ok',
      'c.png:ok',
      `x.png:${EVIDENCE_ERROR_CODES.CONTENT_MISMATCH}`,
      'd.png:ok',
      'e.png:ok',
      `f.png:${EVIDENCE_ERROR_CODES.TOO_MANY}`,
    ]);
  });

  it('al quitar un archivo aceptado, admite el primer excedente válido', async () => {
    const files = [1, 2, 3, 4, 5, 6].map((n) => pngFile(`valida-${n}.png`));
    const { selection } = await selectionWith(files);
    const second = selection.items[1];
    if (!second) throw new Error('falta el segundo archivo');

    const updated = removeFromEvidenceSelection(selection, second.key);

    expect(statuses(updated)).toEqual([
      'valida-1.png:ok',
      'valida-3.png:ok',
      'valida-4.png:ok',
      'valida-5.png:ok',
      'valida-6.png:ok',
    ]);
  });

  it('no modifica la selección anterior (estado inmutable)', async () => {
    const { selection } = await selectionWith([pngFile('a.png')]);
    const key = selection.items[0]?.key ?? '';

    const after = await selectionWith([pngFile('b.png')], selection);
    const removed = removeFromEvidenceSelection(after.selection, key);

    expect(statuses(selection)).toEqual(['a.png:ok']);
    expect(statuses(after.selection)).toEqual(['a.png:ok', 'b.png:ok']);
    expect(statuses(removed)).toEqual(['b.png:ok']);
  });
});

describe('duplicados y eliminación', () => {
  it('ignora un archivo ya seleccionado y lo informa como duplicado', async () => {
    const first = await selectionWith([pngFile('a.png')]);

    const again = await selectionWith(
      [pngFile('a.png'), pngFile('b.png')],
      first.selection,
    );

    expect(statuses(again.selection)).toEqual(['a.png:ok', 'b.png:ok']);
    expect(again.duplicates.map((entry) => entry.file.name)).toEqual(['a.png']);
  });

  it('ignora duplicados dentro de una misma selección', async () => {
    const { selection, duplicates } = await selectionWith([
      pngFile('a.png'),
      pngFile('a.png'),
    ]);

    expect(statuses(selection)).toEqual(['a.png:ok']);
    expect(duplicates).toHaveLength(1);
  });

  it('tampoco repite un archivo rechazado', async () => {
    const first = await selectionWith([disguisedFile('x.png')]);
    const again = await selectionWith(
      [disguisedFile('x.png')],
      first.selection,
    );

    expect(again.selection.items).toHaveLength(1);
    expect(again.duplicates).toHaveLength(1);
  });

  it('distingue archivos con el mismo nombre pero distinto contenido o fecha', async () => {
    const { selection, duplicates } = await selectionWith([
      pngFile('captura.png', 64, 1),
      pngFile('captura.png', 65, 1),
      pngFile('captura.png', 64, 2),
    ]);

    expect(selection.items).toHaveLength(3);
    expect(duplicates).toHaveLength(0);
  });

  it('permite quitar un archivo rechazado y volver a añadirlo', async () => {
    const { selection } = await selectionWith([disguisedFile('x.png')]);
    const key = selection.items[0]?.key ?? '';

    const removed = removeFromEvidenceSelection(selection, key);
    const readded = await selectionWith([disguisedFile('x.png')], removed);

    expect(removed.items).toHaveLength(0);
    expect(readded.duplicates).toHaveLength(0);
    expect(readded.selection.items).toHaveLength(1);
  });

  it('devuelve la misma selección si la clave no existe', async () => {
    const { selection } = await selectionWith([pngFile('a.png')]);

    expect(removeFromEvidenceSelection(selection, 'inexistente')).toBe(
      selection,
    );
  });
});

describe('envío preparado', () => {
  it('incluye solo los archivos aceptados y los vuelve a validar como lote', async () => {
    const { selection } = await selectionWith([
      pngFile('a.png'),
      disguisedFile('x.png'),
      pdfFile('b.pdf'),
    ]);

    const submission = evidenceSubmission(selection);

    expect(submission.files.map((file) => file.name)).toEqual([
      'a.png',
      'b.pdf',
    ]);
    expect(submission.batch).toEqual({
      ok: true,
      evidences: [
        expect.objectContaining({ name: 'a.png', kind: 'png' }),
        expect.objectContaining({ name: 'b.pdf', kind: 'pdf' }),
      ],
    });
  });

  it('una selección vacía produce un envío vacío', () => {
    expect(evidenceSubmission(EMPTY_EVIDENCE_SELECTION)).toEqual({
      files: [],
      batch: { ok: true, evidences: [] },
    });
  });
});

describe('mensajes en español', () => {
  it('tiene un mensaje para cada código de error de rules.ts', () => {
    const codes = Object.values(EVIDENCE_ERROR_CODES).sort();

    expect(Object.keys(EVIDENCE_ERROR_MESSAGES).sort()).toEqual(codes);
    for (const code of codes) {
      expect(EVIDENCE_ERROR_MESSAGES[code].trim()).not.toBe('');
    }
  });

  it('deriva las cifras de los límites de las constantes compartidas', () => {
    expect(EVIDENCE_ERROR_MESSAGES.EVIDENCE_TOO_LARGE).toContain(
      `${EVIDENCE_MAX_FILE_BYTES / (1024 * 1024)} MB`,
    );
    expect(EVIDENCE_ERROR_MESSAGES.EVIDENCE_TOO_MANY).toContain(
      `${EVIDENCE_MAX_FILES} archivos`,
    );
  });

  it('enumera los tipos permitidos en el mensaje de tipo no admitido', () => {
    const message = EVIDENCE_ERROR_MESSAGES.EVIDENCE_TYPE_NOT_ALLOWED;

    for (const extension of ['PNG', 'JPG', 'JPEG', 'WEBP', 'PDF']) {
      expect(message).toContain(extension);
    }
  });
});
