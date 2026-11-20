import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { GET, POST } from '../src/app/api/reports/[reportId]/evidences/route';
import { POST as POST_UPLOADS } from '../src/app/api/reports/[reportId]/evidences/uploads/route';
import {
  EVIDENCE_BUCKET,
  EVIDENCE_SIGNED_URL_SECONDS,
  EvidenceApiError,
  type EvidenceServiceOptions,
  confirmEvidence,
  extractBearerToken,
  listReportEvidences,
  requestEvidenceUploads,
  runEvidenceOperation,
} from '../src/server/evidences';
import { SupabaseConfigurationError } from '../src/lib/supabase/config';
import {
  createFakeSupabase,
  type FakeSupabaseConfig,
} from './support/fake-supabase';

const USER = 'a1111111-1111-4111-8111-111111111111';
const REPORT = 'c1111111-1111-4111-8111-111111111111';
const UPLOAD = 'd1111111-1111-4111-8111-111111111111';
const EVIDENCE = 'e1111111-1111-4111-8111-111111111111';
const TOKEN = 'token-valido';
const CONTRIBUTOR_PERMISSIONS = {
  roleCode: 'contributor',
  permissions: ['reports.create', 'evidences.add', 'assessments.submit'],
};
const UNAUTHENTICATED = {
  error: { code: 'UNAUTHENTICATED', message: 'Sesión no válida o caducada.' },
};

let pngWithGps: Uint8Array<ArrayBuffer>;

beforeAll(async () => {
  // Captura real con datos personales en EXIF y GPS.
  pngWithGps = new Uint8Array(
    await sharp({
      create: { width: 3, height: 2, channels: 3, background: '#123456' },
    })
      .withExif({
        IFD0: { Artist: 'Ana García' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '36/1 43/1 0/1' },
      })
      .png()
      .toBuffer(),
  );
});

function setup(config: FakeSupabaseConfig = {}) {
  const fake = createFakeSupabase({
    user: { id: USER },
    profile: { id: USER, is_active: true },
    permissions: CONTRIBUTOR_PERMISSIONS,
    report: { id: REPORT },
    ...config,
  });
  let ids = [UPLOAD, EVIDENCE, 'f1111111-1111-4111-8111-111111111111'];
  const options = {
    client: fake.client,
    newId: () => {
      const [next, ...rest] = ids;
      ids = rest;
      return next ?? 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    },
    logError: vi.fn(),
    now: () => new Date('2026-11-19T10:00:00.000Z'),
  };
  return { ...fake, options };
}

const body = (value: unknown) => () => Promise.resolve(value);

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof EvidenceApiError) {
      return { status: error.status, code: error.code, details: error.details };
    }
    throw error;
  }
  throw new Error('Se esperaba un error');
}

const rawPath = `${USER}/${REPORT}/${UPLOAD}.png`;
const finalPath = `${USER}/${REPORT}/${EVIDENCE}.png`;

describe('autenticación y acceso (401, 403, 404)', () => {
  it.each([
    ['sin token', null, {}],
    ['token vacío', '   ', {}],
    ['token inválido o caducado', TOKEN, { authError: true }],
    ['token sin usuario', TOKEN, { user: null }],
  ])('responde 401 UNAUTHENTICATED: %s', async (_case, token, config) => {
    const { options } = setup(config as FakeSupabaseConfig);
    const operations = [
      requestEvidenceUploads(
        { reportId: REPORT, accessToken: token, readBody: body({}) },
        options,
      ),
      confirmEvidence(
        { reportId: REPORT, accessToken: token, readBody: body({}) },
        options,
      ),
      listReportEvidences(
        {
          reportId: REPORT,
          accessToken: token,
          searchParams: new URLSearchParams(),
        },
        options,
      ),
    ];
    for (const operation of operations) {
      expect(await errorOf(operation)).toMatchObject({
        status: 401,
        code: 'UNAUTHENTICATED',
      });
    }
  });

  it('valida el token contra Auth con getUser', async () => {
    const { options, calls } = setup();
    await requestEvidenceUploads(
      {
        reportId: REPORT,
        accessToken: TOKEN,
        readBody: body({
          files: [{ name: 'a.png', type: 'image/png', size: 10 }],
        }),
      },
      options,
    );
    expect(calls.getUserTokens).toEqual([TOKEN]);
  });

  it.each([
    ['perfil inactivo', { profile: { id: USER, is_active: false } }],
    ['perfil inexistente', { profile: null }],
  ])('responde 403 con %s al subir o confirmar', async (_case, config) => {
    const { options } = setup(config);
    expect(
      await errorOf(
        requestEvidenceUploads(
          { reportId: REPORT, accessToken: TOKEN, readBody: body({}) },
          options,
        ),
      ),
    ).toMatchObject({ status: 403, code: 'FORBIDDEN_INACTIVE_PROFILE' });
    expect(
      await errorOf(
        confirmEvidence(
          { reportId: REPORT, accessToken: TOKEN, readBody: body({}) },
          options,
        ),
      ),
    ).toMatchObject({ status: 403, code: 'FORBIDDEN_INACTIVE_PROFILE' });
  });

  it('un perfil inactivo puede seguir leyendo lo que la RLS le permite', async () => {
    const { options } = setup({ profile: { id: USER, is_active: false } });
    await expect(
      listReportEvidences(
        {
          reportId: REPORT,
          accessToken: TOKEN,
          searchParams: new URLSearchParams(),
        },
        options,
      ),
    ).resolves.toEqual({ items: [], nextCursor: null });
  });

  it.each([
    ['reportId mal formado', 'no-es-un-uuid', {}],
    ['reporte oculto por la RLS o inexistente', REPORT, { report: null }],
  ])('responde 404 REPORT_NOT_FOUND: %s', async (_case, reportId, config) => {
    const { options } = setup(config);
    for (const operation of [
      requestEvidenceUploads(
        { reportId, accessToken: TOKEN, readBody: body({}) },
        options,
      ),
      confirmEvidence(
        { reportId, accessToken: TOKEN, readBody: body({}) },
        options,
      ),
      listReportEvidences(
        { reportId, accessToken: TOKEN, searchParams: new URLSearchParams() },
        options,
      ),
    ]) {
      expect(await errorOf(operation)).toMatchObject({
        status: 404,
        code: 'REPORT_NOT_FOUND',
      });
    }
  });

  it.each([
    ['perfil', { profileError: true }, 'PROFILE_LOOKUP_FAILED'],
    ['reporte', { reportError: true }, 'REPORT_LOOKUP_FAILED'],
  ])(
    'responde 500 si falla la consulta del %s',
    async (_case, config, code) => {
      const { options } = setup(config);
      expect(
        await errorOf(
          requestEvidenceUploads(
            { reportId: REPORT, accessToken: TOKEN, readBody: body({}) },
            options,
          ),
        ),
      ).toMatchObject({ status: 500, code });
    },
  );
});

describe('permiso evidences.add (HU-06/CA1)', () => {
  type Recalculate = NonNullable<
    EvidenceServiceOptions['recalculateCredibility']
  >;

  const FORBIDDEN = {
    error: {
      code: 'FORBIDDEN_MISSING_PERMISSION',
      message: 'No tienes permiso para aportar evidencias.',
    },
  };
  const withoutEvidences = {
    permissions: { roleCode: 'reader', permissions: ['reports.create'] },
  };

  /** Ejecuta los dos POST con un archivo válido y el original ya subido. */
  const postBoth = (config: FakeSupabaseConfig) => {
    const uploads = setup(config);
    const confirm = setup({
      objects: new Map([
        [rawPath, new Blob([pngWithGps], { type: 'image/png' })],
      ]),
      ...config,
    });
    confirm.options.newId = () => EVIDENCE;
    const recalculate = vi.fn<Recalculate>();
    return {
      uploads,
      confirm,
      recalculate,
      requestUploads: () =>
        requestEvidenceUploads(
          {
            reportId: REPORT,
            accessToken: TOKEN,
            readBody: body({
              files: [{ name: 'captura.png', type: 'image/png', size: 10 }],
            }),
          },
          uploads.options,
        ),
      confirmUpload: () =>
        confirmEvidence(
          {
            reportId: REPORT,
            accessToken: TOKEN,
            readBody: body({ uploadId: UPLOAD, originalName: 'captura.png' }),
          },
          { ...confirm.options, recalculateCredibility: recalculate },
        ),
    };
  };

  /** Comprueba que ninguno de los dos POST llegó a tocar Storage ni la tabla. */
  const expectNothingDone = ({
    uploads,
    confirm,
    recalculate,
  }: ReturnType<typeof postBoth>) => {
    for (const { calls } of [uploads, confirm]) {
      expect(calls.signedUploads).toEqual([]);
      expect(calls.downloads).toEqual([]);
      expect(calls.uploads).toEqual([]);
      expect(calls.inserted).toEqual([]);
      expect(calls.removed).toEqual([]);
      expect(calls.filters.map(({ table }) => table)).not.toContain('reports');
      expect(calls.filters.map(({ table }) => table)).not.toContain(
        'report_evidences',
      );
    }
    expect(recalculate).not.toHaveBeenCalled();
  };

  it('sin evidences.add responde 403 FORBIDDEN_MISSING_PERMISSION en los dos POST', async () => {
    const run = postBoth(withoutEvidences);

    for (const operation of [run.requestUploads, run.confirmUpload]) {
      expect(await runEvidenceOperation(201, operation, vi.fn())).toEqual({
        status: 403,
        body: FORBIDDEN,
      });
    }
    expectNothingDone(run);
  });

  it.each([
    ['sin datos', null],
    ['sin "permissions"', { roleCode: 'contributor' }],
    ['"permissions" no es una lista', { permissions: 'evidences.add' }],
    [
      'lista con valores que no son texto',
      { permissions: ['evidences.add', 1] },
    ],
    ['respuesta con forma de lista', ['evidences.add']],
  ])(
    'responde 403 si permissions está mal formado: %s',
    async (_case, data) => {
      const run = postBoth({ permissions: data });

      for (const operation of [run.requestUploads, run.confirmUpload]) {
        expect(await errorOf(operation())).toMatchObject({
          status: 403,
          code: 'FORBIDDEN_MISSING_PERMISSION',
        });
      }
      expectNothingDone(run);
    },
  );

  it('no deduce el permiso del rol: un rol con permisos vacíos no puede aportar', async () => {
    const run = postBoth({
      permissions: { roleCode: 'admin', permissions: [] },
    });
    for (const operation of [run.requestUploads, run.confirmUpload]) {
      expect(await errorOf(operation())).toMatchObject({
        status: 403,
        code: 'FORBIDDEN_MISSING_PERMISSION',
      });
    }
  });

  it('responde 500 PERMISSION_LOOKUP_FAILED, sin detalles, si falla la RPC', async () => {
    const run = postBoth({
      permissionsError: {
        message: 'permission denied for function',
        code: '42501',
      },
    });

    for (const operation of [run.requestUploads, run.confirmUpload]) {
      const response = await runEvidenceOperation(201, operation, vi.fn());
      expect(response).toEqual({
        status: 500,
        body: {
          error: {
            code: 'PERMISSION_LOOKUP_FAILED',
            message: 'No se pudieron comprobar los permisos.',
          },
        },
      });
      expect(JSON.stringify(response.body)).not.toContain('42501');
    }
    expectNothingDone(run);
  });

  it('respeta el orden 401 → 403 perfil inactivo → 403 sin permiso → 404', async () => {
    const inactive = postBoth({
      ...withoutEvidences,
      profile: { id: USER, is_active: false },
    });
    for (const operation of [inactive.requestUploads, inactive.confirmUpload]) {
      expect(await errorOf(operation())).toMatchObject({
        status: 403,
        code: 'FORBIDDEN_INACTIVE_PROFILE',
      });
    }
    expect(inactive.uploads.calls.rpc).toEqual([]);
    expect(inactive.confirm.calls.rpc).toEqual([]);

    const hidden = postBoth({ ...withoutEvidences, report: null });
    for (const operation of [hidden.requestUploads, hidden.confirmUpload]) {
      expect(await errorOf(operation())).toMatchObject({
        status: 403,
        code: 'FORBIDDEN_MISSING_PERMISSION',
      });
    }
  });

  it('con el permiso consulta my_permissions con el cliente de la petición y sigue', async () => {
    const run = postBoth({});
    run.recalculate.mockResolvedValue({
      score: 55,
      level: 'medium',
      updatedAt: '2026-11-19T10:00:00.000Z',
      sufficientData: false,
    });

    await expect(run.requestUploads()).resolves.toMatchObject({
      uploads: [{ uploadId: UPLOAD }],
    });
    await expect(run.confirmUpload()).resolves.toMatchObject({
      evidence: { id: EVIDENCE },
    });

    expect(run.uploads.calls.rpc).toEqual([
      { name: 'my_permissions', args: undefined },
    ]);
    expect(run.confirm.calls.rpc).toEqual([
      { name: 'my_permissions', args: undefined },
    ]);
    expect(run.uploads.calls.signedUploads).toHaveLength(1);
    expect(run.confirm.calls.inserted).toHaveLength(1);
    expect(run.recalculate).toHaveBeenCalledOnce();
  });

  it('GET /evidences no consulta el permiso de aportar', async () => {
    const { options, calls } = setup(withoutEvidences);
    await expect(
      listReportEvidences(
        {
          reportId: REPORT,
          accessToken: TOKEN,
          searchParams: new URLSearchParams(),
        },
        options,
      ),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(calls.rpc).toEqual([]);
  });
});

describe('paso 1: pedir las URL de subida', () => {
  const request = (files: unknown, config: FakeSupabaseConfig = {}) => {
    const context = setup(config);
    return {
      context,
      run: () =>
        requestEvidenceUploads(
          { reportId: REPORT, accessToken: TOKEN, readBody: body({ files }) },
          context.options,
        ),
    };
  };

  it('devuelve una URL firmada por archivo en {user}/{report}/{uuid}.{ext}', async () => {
    const { context, run } = request([
      { name: 'captura.png', type: 'image/png', size: 2048 },
      { name: 'foto.JPEG', type: 'image/jpeg', size: 4096 },
    ]);

    const result = await run();

    expect(result.uploads).toEqual([
      expect.objectContaining({
        uploadId: UPLOAD,
        path: rawPath,
        token: `token-${rawPath}`,
      }),
      expect.objectContaining({
        uploadId: EVIDENCE,
        path: `${USER}/${REPORT}/${EVIDENCE}.jpg`,
      }),
    ]);
    expect(result.uploads[0]?.signedUrl).toContain(rawPath);
    expect(
      context.calls.buckets.every((name) => name === EVIDENCE_BUCKET),
    ).toBe(true);
    expect(context.calls.filters).toContainEqual({
      table: 'report_evidences',
      column: 'uploaded_by',
      value: USER,
    });
  });

  it.each([
    [
      'tipo inválido (PDF)',
      { name: 'factura.pdf', type: 'application/pdf', size: 10 },
      'EVIDENCE_TYPE_NOT_ALLOWED',
    ],
    [
      'tamaño excesivo',
      { name: 'enorme.png', type: 'image/png', size: 10 * 1024 * 1024 + 1 },
      'EVIDENCE_TOO_LARGE',
    ],
    [
      'archivo vacío',
      { name: 'vacio.png', type: 'image/png', size: 0 },
      'EVIDENCE_EMPTY',
    ],
    [
      'extensión disfrazada',
      { name: 'foto.exe.png', type: 'image/png', size: 10 },
      'EVIDENCE_TYPE_NOT_ALLOWED',
    ],
    [
      'nombre con ruta',
      { name: '../x.png', type: 'image/png', size: 10 },
      'EVIDENCE_NAME_INVALID',
    ],
  ])('rechaza con 400 EVIDENCE_REJECTED: %s', async (_case, file, code) => {
    const { context, run } = request([
      { name: 'ok.png', type: 'image/png', size: 10 },
      file,
    ]);

    expect(await errorOf(run())).toEqual({
      status: 400,
      code: 'EVIDENCE_REJECTED',
      details: [{ index: 1, code }],
    });
    expect(context.calls.signedUploads).toEqual([]);
  });

  it('rechaza más de EVIDENCE_MAX_FILES archivos en un envío', async () => {
    const files = Array.from({ length: 6 }, (_, i) => ({
      name: `c${i}.png`,
      type: 'image/png',
      size: 10,
    }));
    expect(await errorOf(request(files).run())).toEqual({
      status: 400,
      code: 'EVIDENCE_REJECTED',
      details: [{ index: null, code: 'EVIDENCE_TOO_MANY' }],
    });
  });

  it('rechaza superar 5 evidencias del colaborador en el reporte', async () => {
    const { context, run } = request(
      [
        { name: 'a.png', type: 'image/png', size: 10 },
        { name: 'b.png', type: 'image/png', size: 10 },
      ],
      { ownCount: 4 },
    );

    expect(await errorOf(run())).toEqual({
      status: 400,
      code: 'EVIDENCE_REJECTED',
      details: [{ index: null, code: 'EVIDENCE_TOO_MANY' }],
    });
    expect(context.calls.signedUploads).toEqual([]);
  });

  it.each([
    ['sin cuerpo', undefined],
    ['sin lista', {}],
    ['lista vacía', { files: [] }],
    ['elemento que no es objeto', { files: ['a.png'] }],
    [
      'tamaño no numérico',
      { files: [{ name: 'a.png', type: 'image/png', size: '10' }] },
    ],
    ['nombre ausente', { files: [{ type: 'image/png', size: 10 }] }],
  ])('responde 400 INVALID_REQUEST: %s', async (_case, value) => {
    const { options } = setup();
    expect(
      await errorOf(
        requestEvidenceUploads(
          { reportId: REPORT, accessToken: TOKEN, readBody: body(value) },
          options,
        ),
      ),
    ).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  });

  it('responde 400 INVALID_REQUEST si el JSON no se puede leer', async () => {
    const { options } = setup();
    const readBody = () => Promise.reject(new SyntaxError('Unexpected token'));
    expect(
      await errorOf(
        requestEvidenceUploads(
          { reportId: REPORT, accessToken: TOKEN, readBody },
          options,
        ),
      ),
    ).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  });

  it.each([
    ['el recuento', { countError: true }, 'EVIDENCE_PERSISTENCE_FAILED'],
    ['la URL firmada', { signedUploadError: true }, 'EVIDENCE_STORAGE_FAILED'],
  ])('responde 500 si falla %s', async (_case, config, code) => {
    expect(
      await errorOf(
        request([{ name: 'a.png', type: 'image/png', size: 10 }], config).run(),
      ),
    ).toMatchObject({ status: 500, code });
  });
});

describe('paso 3: confirmar la evidencia', () => {
  const confirm = (
    config: FakeSupabaseConfig = {},
    value: unknown = { uploadId: UPLOAD, originalName: 'captura.png' },
  ) => {
    const context = setup(config);
    // En la confirmación, el primer UUID nuevo es el de la evidencia.
    context.options.newId = () => EVIDENCE;
    return {
      context,
      run: () =>
        confirmEvidence(
          { reportId: REPORT, accessToken: TOKEN, readBody: body(value) },
          context.options,
        ),
    };
  };

  const withObject = (blob: Blob) => new Map([[rawPath, blob]]);

  it('guarda una copia sin EXIF ni GPS, registra la fila y borra el original', async () => {
    const onEvidenceSaved = vi.fn().mockResolvedValue(undefined);
    const { context } = confirm({
      objects: withObject(new Blob([pngWithGps], { type: 'image/png' })),
    });

    const result = await confirmEvidence(
      {
        reportId: REPORT,
        accessToken: TOKEN,
        readBody: body({ uploadId: UPLOAD, originalName: 'capturaña.png' }),
      },
      { ...context.options, onEvidenceSaved },
    );

    const stored = context.calls.uploads[0];
    expect(stored).toMatchObject({
      path: finalPath,
      contentType: 'image/png',
      upsert: false,
    });
    const metadata = await sharp(stored?.bytes).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.format).toBe('png');

    const sha256 = createHash('sha256')
      .update(stored?.bytes ?? new Uint8Array())
      .digest('hex');
    expect(context.calls.inserted).toEqual([
      {
        id: EVIDENCE,
        report_id: REPORT,
        uploaded_by: USER,
        storage_path: finalPath,
        original_name: 'capturaña.png',
        mime_type: 'image/png',
        size_bytes: stored?.bytes.byteLength,
        sha256,
      },
    ]);
    expect(context.calls.removed).toEqual([[rawPath]]);
    expect(result).toEqual({
      evidence: {
        id: EVIDENCE,
        reportId: REPORT,
        originalName: 'capturaña.png',
        mimeType: 'image/png',
        sizeBytes: stored?.bytes.byteLength,
        moderationStatus: 'visible',
        createdAt: '2026-11-19T10:00:00.000Z',
      },
    });
    // Enganche genérico tras guardar (el recálculo de HU-06/T5 se prueba aparte).
    expect(onEvidenceSaved).toHaveBeenCalledWith(result.evidence);
  });

  it('un fallo del enganche posterior no cambia la respuesta', async () => {
    const { context } = confirm({
      objects: withObject(new Blob([pngWithGps], { type: 'image/png' })),
    });
    const onEvidenceSaved = vi
      .fn()
      .mockRejectedValue(new Error('recalculo caído'));

    await expect(
      confirmEvidence(
        {
          reportId: REPORT,
          accessToken: TOKEN,
          readBody: body({ uploadId: UPLOAD, originalName: 'captura.png' }),
        },
        { ...context.options, onEvidenceSaved },
      ),
    ).resolves.toMatchObject({ evidence: { id: EVIDENCE } });
    expect(context.options.logError).toHaveBeenCalled();
  });

  it('rechaza magic bytes falsos y borra el objeto subido', async () => {
    const fake = new Blob(
      [new TextEncoder().encode('MZ ejecutable disfrazado')],
      { type: 'image/png' },
    );
    const { context, run } = confirm({ objects: withObject(fake) });

    expect(await errorOf(run())).toEqual({
      status: 400,
      code: 'EVIDENCE_REJECTED',
      details: [{ index: 0, code: 'EVIDENCE_CONTENT_MISMATCH' }],
    });
    expect(context.calls.removed).toEqual([[rawPath]]);
    expect(context.calls.inserted).toEqual([]);
  });

  it('rechaza una imagen con firma válida que no se puede decodificar', async () => {
    const corrupt = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 9, 9,
    ]);
    const { context, run } = confirm({
      objects: withObject(new Blob([corrupt], { type: 'image/png' })),
    });

    expect(await errorOf(run())).toMatchObject({
      status: 400,
      details: [{ index: 0, code: 'EVIDENCE_CONTENT_MISMATCH' }],
    });
    expect(context.calls.removed).toEqual([[rawPath]]);
  });

  it('rechaza un objeto con más bytes de los permitidos', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(pngWithGps.subarray(0, 12));
    const { context, run } = confirm({
      objects: withObject(new Blob([big], { type: 'image/png' })),
    });

    expect(await errorOf(run())).toMatchObject({
      details: [{ index: 0, code: 'EVIDENCE_TOO_LARGE' }],
    });
    expect(context.calls.removed).toEqual([[rawPath]]);
  });

  it('rechaza un objeto cuyo tipo guardado no coincide con el nombre', async () => {
    const { run } = confirm({
      objects: withObject(new Blob([pngWithGps], { type: 'image/webp' })),
    });
    expect(await errorOf(run())).toMatchObject({
      details: [{ index: 0, code: 'EVIDENCE_CONTENT_MISMATCH' }],
    });
  });

  it('rechaza un nombre con un tipo no permitido sin buscar el objeto', async () => {
    const { context, run } = confirm(
      {},
      { uploadId: UPLOAD, originalName: 'factura.pdf' },
    );
    expect(await errorOf(run())).toEqual({
      status: 400,
      code: 'EVIDENCE_REJECTED',
      details: [{ index: 0, code: 'EVIDENCE_TYPE_NOT_ALLOWED' }],
    });
    expect(context.calls.downloads).toEqual([]);
  });

  it('busca el objeto con la extensión canónica (.jpg) y nunca con una ruta del cliente', async () => {
    const { context, run } = confirm(
      {},
      { uploadId: UPLOAD, originalName: 'Foto.JPEG' },
    );
    expect(await errorOf(run())).toMatchObject({
      status: 400,
      code: 'EVIDENCE_UPLOAD_MISSING',
    });
    expect(context.calls.downloads).toEqual([
      `${USER}/${REPORT}/${UPLOAD}.jpg`,
    ]);
  });

  it.each([
    [
      'el trigger del límite',
      { code: '23514', message: 'EVIDENCE_TOO_MANY' },
      400,
      'EVIDENCE_REJECTED',
    ],
    [
      'el contenido duplicado',
      { code: '23505', message: 'duplicate key' },
      409,
      'EVIDENCE_DUPLICATE',
    ],
    [
      'otro error',
      { code: '42501', message: 'row-level security' },
      500,
      'EVIDENCE_PERSISTENCE_FAILED',
    ],
  ])(
    'si la inserción falla por %s, borra la copia y el original',
    async (_case, insertError, status, code) => {
      const { context, run } = confirm({
        objects: withObject(new Blob([pngWithGps], { type: 'image/png' })),
        insertError,
      });

      expect(await errorOf(run())).toMatchObject({ status, code });
      expect(context.calls.removed).toEqual([[finalPath, rawPath]]);
    },
  );

  it('el límite del trigger se informa con el código de rules.ts', async () => {
    const { run } = confirm({
      objects: withObject(new Blob([pngWithGps], { type: 'image/png' })),
      insertError: { code: '23514', message: 'EVIDENCE_TOO_MANY' },
    });
    expect(await errorOf(run())).toMatchObject({
      details: [{ index: null, code: 'EVIDENCE_TOO_MANY' }],
    });
  });

  it('responde 500 si no puede guardar la copia y borra el original', async () => {
    const { context, run } = confirm({
      objects: withObject(new Blob([pngWithGps], { type: 'image/png' })),
      uploadError: true,
    });
    expect(await errorOf(run())).toMatchObject({
      status: 500,
      code: 'EVIDENCE_STORAGE_FAILED',
    });
    expect(context.calls.removed).toEqual([[rawPath]]);
  });

  it('registra, sin fallar, que no se pudo borrar un objeto', async () => {
    const { context, run } = confirm({
      objects: withObject(new Blob([pngWithGps], { type: 'image/png' })),
      removeError: true,
    });
    await expect(run()).resolves.toMatchObject({ evidence: { id: EVIDENCE } });
    expect(context.options.logError).toHaveBeenCalledWith(
      expect.stringContaining('No se pudieron borrar'),
      expect.anything(),
    );
  });

  it.each([
    [
      'no encontrado',
      { message: 'Object not found', status: 400, statusCode: '404' },
      400,
      'EVIDENCE_UPLOAD_MISSING',
    ],
    [
      'otro fallo',
      { message: 'Bad gateway', status: 502 },
      500,
      'EVIDENCE_STORAGE_FAILED',
    ],
  ])(
    'al descargar el original, %s',
    async (_case, downloadError, status, code) => {
      const { run } = confirm({ downloadError });
      expect(await errorOf(run())).toMatchObject({ status, code });
    },
  );

  it.each([
    ['sin uploadId', { originalName: 'a.png' }],
    ['uploadId que no es UUID', { uploadId: '../otro', originalName: 'a.png' }],
    ['sin nombre', { uploadId: UPLOAD }],
    ['cuerpo que no es objeto', ['a']],
  ])('responde 400 INVALID_REQUEST: %s', async (_case, value) => {
    expect(await errorOf(confirm({}, value).run())).toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
    });
  });
});

describe('paso 3: recálculo de la credibilidad (HU-06/T5)', () => {
  type Recalculate = NonNullable<
    EvidenceServiceOptions['recalculateCredibility']
  >;
  type OnSaved = NonNullable<EvidenceServiceOptions['onEvidenceSaved']>;

  const credibility = {
    score: 55,
    level: 'medium' as const,
    updatedAt: '2026-11-19T10:00:00.000Z',
    sufficientData: false,
  };

  // Fila de `report_credibility_inputs` tras guardar una evidencia visible.
  const inputsRow = {
    report_id: REPORT,
    report_created_at: '2026-11-18T10:00:00.000Z',
    visible_evidences: 1,
    latest_evidence_at: '2026-11-19T10:00:00.000Z',
    validations: 0,
    validation_trust_sum: 0,
    invalidations: 0,
    invalidation_trust_sum: 0,
    latest_assessment_at: null,
  };

  const confirmed = { uploadId: UPLOAD, originalName: 'captura.png' };

  /** Confirmación con el original subido y, si se indica, el recálculo inyectado. */
  const confirmWith = (
    config: FakeSupabaseConfig = {},
    recalculateCredibility?: Recalculate,
    value: unknown = confirmed,
    extra: { onEvidenceSaved?: OnSaved } = {},
  ) => {
    const context = setup({
      objects: new Map([
        [rawPath, new Blob([pngWithGps], { type: 'image/png' })],
      ]),
      ...config,
    });
    context.options.newId = () => EVIDENCE;
    const options = {
      ...context.options,
      ...extra,
      ...(recalculateCredibility ? { recalculateCredibility } : {}),
    };
    return {
      context,
      run: () =>
        confirmEvidence(
          { reportId: REPORT, accessToken: TOKEN, readBody: body(value) },
          options,
        ),
    };
  };

  it('recalcula una vez, tras registrar la evidencia, con evidence_added y su id', async () => {
    const seen: { inserted: number; removed: string[][] }[] = [];
    const recalculate = vi.fn<Recalculate>();
    const { context, run } = confirmWith({}, recalculate);
    recalculate.mockImplementation(async () => {
      seen.push({
        inserted: context.calls.inserted.length,
        removed: [...context.calls.removed],
      });
      return credibility;
    });

    const result = await run();

    expect(recalculate).toHaveBeenCalledOnce();
    expect(recalculate).toHaveBeenCalledWith(
      REPORT,
      { cause: 'evidence_added', triggerId: EVIDENCE },
      expect.objectContaining({ client: context.client }),
    );
    expect(result.evidence.id).toBe(EVIDENCE);
    // Después de insertar la fila y de retirar el original.
    expect(seen).toEqual([{ inserted: 1, removed: [[rawPath]] }]);
  });

  it('por defecto usa recalculateReportCredibility con el cliente de la petición', async () => {
    const { context, run } = confirmWith({ rpcData: [inputsRow] });

    await expect(run()).resolves.toMatchObject({ evidence: { id: EVIDENCE } });

    expect(context.calls.rpc).toEqual([
      { name: 'my_permissions', args: undefined },
      { name: 'report_credibility_inputs', args: { report_ids: [REPORT] } },
    ]);
    expect(context.options.logError).not.toHaveBeenCalled();
  });

  it('si el recálculo falla, la evidencia sigue confirmada y la respuesta HTTP es la misma', async () => {
    const respond = async (recalculate: Recalculate) => {
      const { context, run } = confirmWith({}, recalculate);
      const response = await runEvidenceOperation(201, run, vi.fn());
      return { context, response };
    };

    const ok = await respond(
      vi.fn<Recalculate>().mockResolvedValue(credibility),
    );
    const failing = vi
      .fn<Recalculate>()
      .mockRejectedValue(new Error('detalle interno de la RPC (secreto)'));
    const failed = await respond(failing);

    expect(failing).toHaveBeenCalledOnce();
    expect(failed.response).toEqual(ok.response);
    expect(failed.response.status).toBe(201);
    expect(JSON.stringify(failed.response.body)).not.toContain(
      'detalle interno',
    );
    // La evidencia no se compensa: la fila y la copia limpia se conservan.
    expect(failed.context.calls.inserted).toHaveLength(1);
    expect(failed.context.calls.removed).toEqual([[rawPath]]);
  });

  it('un fallo real del cálculo queda registrado con la causa y no cambia el 201', async () => {
    const { context, run } = confirmWith({
      rpcError: { message: 'connection refused' },
    });

    const response = await runEvidenceOperation(201, run, vi.fn());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ evidence: { id: EVIDENCE } });
    expect(JSON.stringify(response.body)).not.toContain('connection refused');
    expect(context.options.logError).toHaveBeenCalledWith(
      expect.stringContaining(`evidence_added (${EVIDENCE})`),
      expect.objectContaining({ code: 'UNAVAILABLE' }),
    );
  });

  it('el enganche onEvidenceSaved se sigue llamando aunque falle el recálculo', async () => {
    const onEvidenceSaved = vi.fn<OnSaved>().mockResolvedValue(undefined);
    const recalculate = vi
      .fn<Recalculate>()
      .mockRejectedValue(new Error('caído'));
    const { run } = confirmWith({}, recalculate, confirmed, {
      onEvidenceSaved,
    });

    const result = await run();

    expect(onEvidenceSaved).toHaveBeenCalledWith(result.evidence);
  });

  it.each([
    [
      'magic bytes falsos',
      {
        objects: new Map([
          [
            rawPath,
            new Blob([new TextEncoder().encode('MZ ejecutable')], {
              type: 'image/png',
            }),
          ],
        ]),
      },
      confirmed,
    ],
    ['subida inexistente', { objects: new Map() }, confirmed],
    ['fallo al descargar', { downloadError: { message: 'x' } }, confirmed],
    ['fallo al guardar la copia', { uploadError: true }, confirmed],
    [
      'contenido duplicado',
      { insertError: { code: '23505', message: 'duplicate key' } },
      confirmed,
    ],
    [
      'límite del trigger',
      { insertError: { code: '23514', message: 'EVIDENCE_TOO_MANY' } },
      confirmed,
    ],
    [
      'fallo de la base de datos',
      { insertError: { code: '42501', message: 'rls' } },
      confirmed,
    ],
    ['tipo no permitido', {}, { uploadId: UPLOAD, originalName: 'a.pdf' }],
    ['cuerpo no válido', {}, { uploadId: 'no-es-uuid' }],
    ['perfil inactivo', { profile: { id: USER, is_active: false } }, confirmed],
    ['sin sesión', { user: null }, confirmed],
  ])(
    'no recalcula si la confirmación falla: %s',
    async (_case, config, value) => {
      const recalculate = vi.fn<Recalculate>().mockResolvedValue(credibility);
      const { run } = confirmWith(
        config as FakeSupabaseConfig,
        recalculate,
        value,
      );

      await expect(run()).rejects.toBeInstanceOf(EvidenceApiError);
      expect(recalculate).not.toHaveBeenCalled();
    },
  );

  it('repetir la confirmación de la misma subida no recalcula dos veces', async () => {
    const recalculate = vi.fn<Recalculate>().mockResolvedValue(credibility);
    const { context, run } = confirmWith({}, recalculate);

    await run();
    // El original ya se retiró: la segunda confirmación no encuentra la subida.
    expect(await errorOf(run())).toMatchObject({
      status: 400,
      code: 'EVIDENCE_UPLOAD_MISSING',
    });

    expect(recalculate).toHaveBeenCalledOnce();
    expect(context.calls.inserted).toHaveLength(1);
  });
});

describe('lectura de evidencias', () => {
  const row = (id: string, createdAt: string) => ({
    id,
    report_id: REPORT,
    storage_path: `${USER}/${REPORT}/${id}.png`,
    original_name: `${id}.png`,
    mime_type: 'image/png',
    size_bytes: 100,
    moderation_status: 'visible',
    created_at: createdAt,
  });

  it('devuelve las evidencias legibles con URL firmadas de 120 s', async () => {
    const { options, calls } = setup({
      listRows: [row(EVIDENCE, '2026-11-19T09:00:00.000Z')],
    });

    const result = await listReportEvidences(
      {
        reportId: REPORT,
        accessToken: TOKEN,
        searchParams: new URLSearchParams(),
      },
      options,
    );

    expect(EVIDENCE_SIGNED_URL_SECONDS).toBe(120);
    expect(result).toEqual({
      items: [
        {
          id: EVIDENCE,
          reportId: REPORT,
          originalName: `${EVIDENCE}.png`,
          mimeType: 'image/png',
          sizeBytes: 100,
          moderationStatus: 'visible',
          createdAt: '2026-11-19T09:00:00.000Z',
          url: `http://storage.test/sign/${USER}/${REPORT}/${EVIDENCE}.png?expires=120`,
          urlExpiresAt: '2026-11-19T10:02:00.000Z',
        },
      ],
      nextCursor: null,
    });
    expect(calls.signedUrls).toEqual([
      { paths: [`${USER}/${REPORT}/${EVIDENCE}.png`], expiresIn: 120 },
    ]);
    expect(calls.limits).toEqual([21]);
  });

  it('pagina con limit y un cursor opaco', async () => {
    const rows = [
      row(EVIDENCE, '2026-11-19T09:00:00.000Z'),
      row('e2222222-2222-4222-8222-222222222222', '2026-11-19T08:00:00.000Z'),
    ];
    const first = setup({ listRows: rows });
    const page = await listReportEvidences(
      {
        reportId: REPORT,
        accessToken: TOKEN,
        searchParams: new URLSearchParams({ limit: '1' }),
      },
      first.options,
    );
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(first.calls.limits).toEqual([2]);

    const second = setup({ listRows: [] });
    await listReportEvidences(
      {
        reportId: REPORT,
        accessToken: TOKEN,
        searchParams: new URLSearchParams({
          limit: '1',
          cursor: page.nextCursor ?? '',
        }),
      },
      second.options,
    );
    expect(second.calls.orFilters[0]).toContain(EVIDENCE);
    expect(second.calls.signedUrls).toEqual([]);
  });

  it.each([
    ['limit fuera de rango', { limit: '51' }],
    ['limit no entero', { limit: 'diez' }],
    ['cursor corrupto', { cursor: '%%%' }],
  ])('responde 400 INVALID_REQUEST: %s', async (_case, params) => {
    const { options } = setup();
    expect(
      await errorOf(
        listReportEvidences(
          {
            reportId: REPORT,
            accessToken: TOKEN,
            searchParams: new URLSearchParams(params),
          },
          options,
        ),
      ),
    ).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  });

  it.each([
    ['la consulta', { listError: true }, 'EVIDENCE_PERSISTENCE_FAILED'],
    [
      'la firma de URL',
      {
        signedUrlsError: true,
        listRows: [row(EVIDENCE, '2026-11-19T09:00:00.000Z')],
      },
      'EVIDENCE_STORAGE_FAILED',
    ],
  ])('responde 500 si falla %s', async (_case, config, code) => {
    const { options } = setup(config);
    expect(
      await errorOf(
        listReportEvidences(
          {
            reportId: REPORT,
            accessToken: TOKEN,
            searchParams: new URLSearchParams(),
          },
          options,
        ),
      ),
    ).toMatchObject({ status: 500, code });
  });
});

describe('respuestas HTTP', () => {
  it('extrae el token Bearer sin distinguir mayúsculas', () => {
    expect(extractBearerToken('bearer  abc ')).toBe('abc');
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
  });

  it('convierte errores en el formato común de la API', async () => {
    expect(
      await runEvidenceOperation(201, () => Promise.resolve({ ok: true })),
    ).toEqual({
      status: 201,
      body: { ok: true },
    });
    expect(
      await runEvidenceOperation(200, () =>
        Promise.reject(
          new EvidenceApiError(400, 'EVIDENCE_REJECTED', 'Rechazado.', [
            { index: 0, code: 'EVIDENCE_EMPTY' },
          ]),
        ),
      ),
    ).toEqual({
      status: 400,
      body: {
        error: {
          code: 'EVIDENCE_REJECTED',
          message: 'Rechazado.',
          details: [{ index: 0, code: 'EVIDENCE_EMPTY' }],
        },
      },
    });
    expect(
      await runEvidenceOperation(200, () =>
        Promise.reject(new SupabaseConfigurationError('falta la URL')),
      ),
    ).toMatchObject({
      status: 503,
      body: { error: { code: 'SERVICE_UNAVAILABLE' } },
    });

    const logError = vi.fn();
    expect(
      await runEvidenceOperation(
        200,
        () => Promise.reject(new Error('x')),
        logError,
      ),
    ).toMatchObject({
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR' } },
    });
    expect(logError).toHaveBeenCalled();
  });

  it('los route handlers responden 401 sin token, con el mismo cuerpo', async () => {
    const params = Promise.resolve({ reportId: REPORT });
    const json = (init?: RequestInit) =>
      new Request(`http://localhost/api/reports/${REPORT}/evidences`, {
        method: 'POST',
        body: '{}',
        ...init,
      });

    for (const response of [
      await POST_UPLOADS(json(), { params }),
      await POST(json(), { params }),
      await GET(
        new Request(`http://localhost/api/reports/${REPORT}/evidences`),
        { params },
      ),
      await POST(json({ headers: { authorization: 'Bearer ' } }), { params }),
    ]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(UNAUTHENTICATED);
    }
  });

  it('los route handlers responden 503 si Supabase no está configurado', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    const response = await GET(
      new Request(`http://localhost/api/reports/${REPORT}/evidences`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
      { params: Promise.resolve({ reportId: REPORT }) },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
  });
});
