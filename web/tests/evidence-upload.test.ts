import { describe, expect, it, vi } from 'vitest';

vi.mock('client-only', () => ({}));

import { EVIDENCE_ERROR_MESSAGES } from '../src/lib/evidences/rules';
import {
  EMPTY_EVIDENCE_SELECTION,
  addToEvidenceSelection,
  prepareEvidenceFiles,
  type PreparedEvidenceFile,
} from '../src/lib/evidences/selection';
import {
  EVIDENCE_UPLOAD_MESSAGES,
  uploadEvidences,
  type EvidenceUploadState,
} from '../src/lib/evidences/upload';
import { getAccessToken } from '../src/lib/supabase/session';
import { SupabaseConfigurationError } from '../src/lib/supabase/config';

const REPORT = 'c1111111-1111-4111-8111-111111111111';
const TOKEN = 'token-de-sesion';
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function prepared(...names: string[]) {
  const files = names.map(
    (name) =>
      new File([new Uint8Array([...PNG, 1, 2, 3, 4])], name, {
        type: 'image/png',
        lastModified: 1,
      }),
  );
  const { selection } = addToEvidenceSelection(
    EMPTY_EVIDENCE_SELECTION,
    await prepareEvidenceFiles(files),
  );
  return selection.items as readonly PreparedEvidenceFile<File>[];
}

type Reply = { status: number; body?: unknown } | Error;

/** fetch simulado: responde en orden y registra cada petición. */
function fakeFetch(...replies: Reply[]) {
  const queue = [...replies];
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      const reply = queue.shift();
      if (!reply) throw new Error(`Petición no prevista: ${String(url)}`);
      if (reply instanceof Error) throw reply;
      return new Response(
        reply.body === undefined ? null : JSON.stringify(reply.body),
        {
          status: reply.status,
        },
      );
    },
  );
  return { fetch: fetch as unknown as typeof globalThis.fetch, requests };
}

const uploadsReply = (...ids: string[]) => ({
  status: 201,
  body: {
    uploads: ids.map((id) => ({
      uploadId: id,
      path: `u/${REPORT}/${id}.png`,
      token: `t-${id}`,
      signedUrl: `http://storage.test/upload/${id}`,
    })),
  },
});
const confirmReply = (id: string) => ({
  status: 201,
  body: { evidence: { id } },
});

function run(
  items: readonly PreparedEvidenceFile<File>[],
  fetch: typeof globalThis.fetch,
  token: string | null = TOKEN,
) {
  const changes: [string, EvidenceUploadState][] = [];
  const result = uploadEvidences(REPORT, items, {
    getAccessToken: async () => token,
    fetch,
    onChange: (key, state) => changes.push([key, state]),
  });
  return { result, changes };
}

describe('subida en dos pasos', () => {
  it('pide las URL, sube cada archivo a Storage y lo confirma', async () => {
    const items = await prepared('a.png', 'b.png');
    const [a, b] = items;
    const { fetch, requests } = fakeFetch(
      uploadsReply('u1', 'u2'),
      { status: 200 },
      confirmReply('e1'),
      { status: 200 },
      confirmReply('e2'),
    );

    const { result, changes } = run(items, fetch);

    expect(await result).toEqual({
      [a!.key]: { phase: 'done', evidenceId: 'e1' },
      [b!.key]: { phase: 'done', evidenceId: 'e2' },
    });
    expect(requests.map((r) => `${r.init?.method} ${r.url}`)).toEqual([
      `POST /api/reports/${REPORT}/evidences/uploads`,
      'PUT http://storage.test/upload/u1',
      `POST /api/reports/${REPORT}/evidences`,
      'PUT http://storage.test/upload/u2',
      `POST /api/reports/${REPORT}/evidences`,
    ]);
    const first = requests[0]!.init!;
    expect(new Headers(first.headers).get('authorization')).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(JSON.parse(String(first.body))).toEqual({
      files: [
        { name: 'a.png', type: 'image/png', size: 12 },
        { name: 'b.png', type: 'image/png', size: 12 },
      ],
    });
    expect(requests[1]!.init!.body).toBe(a!.file);
    expect(new Headers(requests[1]!.init!.headers).get('content-type')).toBe(
      'image/png',
    );
    expect(
      new Headers(requests[1]!.init!.headers).get('authorization'),
    ).toBeNull();
    expect(JSON.parse(String(requests[2]!.init!.body))).toEqual({
      uploadId: 'u1',
      originalName: 'a.png',
    });

    // Estados de progreso por archivo, en orden.
    expect(
      changes.filter(([key]) => key === a!.key).map(([, s]) => s.phase),
    ).toEqual(['requesting', 'uploading', 'confirming', 'done']);
  });

  it('no hace nada con una lista vacía', async () => {
    const { fetch, requests } = fakeFetch();
    expect(await run([], fetch).result).toEqual({});
    expect(requests).toEqual([]);
  });
});

describe('errores y reintento', () => {
  const errorOf = (
    states: Record<string, EvidenceUploadState>,
    key: string,
  ) => {
    const state = states[key];
    return state?.phase === 'error' ? state.error : undefined;
  };

  it('sin sesión no llama a la API y pide iniciar sesión (HU-11)', async () => {
    const [item] = await prepared('a.png');
    const { fetch, requests } = fakeFetch();

    const states = await run([item!], fetch, null).result;

    expect(errorOf(states, item!.key)).toEqual({
      code: 'UNAUTHENTICATED',
      message: EVIDENCE_UPLOAD_MESSAGES.UNAUTHENTICATED,
      retryable: false,
    });
    expect(requests).toEqual([]);
  });

  it('si Supabase no está configurado en el navegador, lo indica sin reintento', async () => {
    const [item] = await prepared('a.png');
    const { fetch } = fakeFetch();
    const states = await uploadEvidences(REPORT, [item!], {
      getAccessToken: () =>
        Promise.reject(new SupabaseConfigurationError('falta')),
      fetch,
      onChange: () => {},
    });
    expect(errorOf(states, item!.key)).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      retryable: false,
    });
  });

  it('si falla la lectura de la sesión, permite reintentar', async () => {
    const [item] = await prepared('a.png');
    const states = await uploadEvidences(REPORT, [item!], {
      getAccessToken: () => Promise.reject(new Error('caída')),
      fetch: fakeFetch().fetch,
      onChange: () => {},
    });
    expect(errorOf(states, item!.key)).toMatchObject({
      code: 'SESSION_UNAVAILABLE',
      retryable: true,
    });
  });

  it.each([
    [401, 'UNAUTHENTICATED', false],
    [403, 'FORBIDDEN_INACTIVE_PROFILE', false],
    [404, 'REPORT_NOT_FOUND', false],
    [503, 'SERVICE_UNAVAILABLE', true],
    [500, 'EVIDENCE_STORAGE_FAILED', true],
    [400, 'INVALID_REQUEST', false],
  ])(
    'el paso 1 con %i marca todos los archivos (%s)',
    async (status, code, retryable) => {
      const items = await prepared('a.png', 'b.png');
      const { fetch } = fakeFetch({
        status,
        body: { error: { code, message: 'x' } },
      });

      const states = await run(items, fetch).result;

      for (const item of items) {
        expect(errorOf(states, item.key)).toMatchObject({ code, retryable });
      }
    },
  );

  it('un rechazo de un archivo concreto solo marca ese archivo; el resto puede reintentarse', async () => {
    const [a, b] = await prepared('a.png', 'b.png');
    const { fetch } = fakeFetch({
      status: 400,
      body: {
        error: {
          code: 'EVIDENCE_REJECTED',
          details: [{ index: 1, code: 'EVIDENCE_TOO_LARGE' }],
        },
      },
    });

    const states = await run([a!, b!], fetch).result;

    expect(errorOf(states, b!.key)).toEqual({
      code: 'EVIDENCE_TOO_LARGE',
      message: EVIDENCE_ERROR_MESSAGES.EVIDENCE_TOO_LARGE,
      retryable: false,
    });
    expect(errorOf(states, a!.key)).toMatchObject({
      code: 'NOT_SENT',
      retryable: true,
    });
  });

  it('el límite de evidencias marca todos los archivos', async () => {
    const items = await prepared('a.png', 'b.png');
    const { fetch } = fakeFetch({
      status: 400,
      body: {
        error: {
          code: 'EVIDENCE_REJECTED',
          details: [{ index: null, code: 'EVIDENCE_TOO_MANY' }],
        },
      },
    });
    const states = await run(items, fetch).result;
    for (const item of items) {
      expect(errorOf(states, item.key)).toMatchObject({
        code: 'EVIDENCE_TOO_MANY',
        retryable: false,
      });
    }
  });

  it('sin conexión, permite reintentar; el reintento repite el flujo y termina', async () => {
    const [item] = await prepared('a.png');
    const offline = fakeFetch(new TypeError('Failed to fetch'));

    const first = await run([item!], offline.fetch).result;
    expect(errorOf(first, item!.key)).toEqual({
      code: 'NETWORK_ERROR',
      message: EVIDENCE_UPLOAD_MESSAGES.NETWORK_ERROR,
      retryable: true,
    });

    const online = fakeFetch(
      uploadsReply('u9'),
      { status: 200 },
      confirmReply('e9'),
    );
    expect(await run([item!], online.fetch).result).toEqual({
      [item!.key]: { phase: 'done', evidenceId: 'e9' },
    });
  });

  it.each([
    ['un error temporal de Storage', { status: 503 }, 'UPLOAD_FAILED', true],
    ['un rechazo de Storage', { status: 400 }, 'UPLOAD_REJECTED', false],
    [
      'un corte de red',
      new TypeError('Failed to fetch'),
      'NETWORK_ERROR',
      true,
    ],
  ])(
    'la subida directa con %s solo afecta a ese archivo',
    async (_case, reply, code, retryable) => {
      const [a, b] = await prepared('a.png', 'b.png');
      const { fetch } = fakeFetch(
        uploadsReply('u1', 'u2'),
        reply as Reply,
        { status: 200 },
        confirmReply('e2'),
      );

      const states = await run([a!, b!], fetch).result;

      expect(errorOf(states, a!.key)).toMatchObject({ code, retryable });
      expect(states[b!.key]).toEqual({ phase: 'done', evidenceId: 'e2' });
    },
  );

  it.each([
    [
      'magic bytes falsos',
      {
        status: 400,
        body: {
          error: {
            code: 'EVIDENCE_REJECTED',
            details: [{ index: 0, code: 'EVIDENCE_CONTENT_MISMATCH' }],
          },
        },
      },
      'EVIDENCE_CONTENT_MISMATCH',
      false,
    ],
    [
      'duplicado',
      { status: 409, body: { error: { code: 'EVIDENCE_DUPLICATE' } } },
      'EVIDENCE_DUPLICATE',
      false,
    ],
    [
      'fallo del servidor',
      { status: 500, body: { error: { code: 'EVIDENCE_PERSISTENCE_FAILED' } } },
      'EVIDENCE_PERSISTENCE_FAILED',
      true,
    ],
    ['respuesta sin JSON', { status: 502 }, 'SERVER_ERROR', true],
    [
      'límite alcanzado entre medias',
      {
        status: 400,
        body: {
          error: {
            code: 'EVIDENCE_REJECTED',
            details: [{ index: null, code: 'EVIDENCE_TOO_MANY' }],
          },
        },
      },
      'EVIDENCE_TOO_MANY',
      false,
    ],
  ])('la confirmación con %s', async (_case, reply, code, retryable) => {
    const [item] = await prepared('a.png');
    const { fetch } = fakeFetch(uploadsReply('u1'), { status: 200 }, reply);

    const states = await run([item!], fetch).result;

    expect(errorOf(states, item!.key)).toMatchObject({ code, retryable });
    expect(errorOf(states, item!.key)?.message.length).toBeGreaterThan(0);
  });

  it('una respuesta 201 incompleta del paso 1 se trata como error del servidor', async () => {
    const [item] = await prepared('a.png');
    const { fetch } = fakeFetch({ status: 201, body: { uploads: [] } });
    const states = await run([item!], fetch).result;
    expect(errorOf(states, item!.key)).toMatchObject({
      code: 'SERVER_ERROR',
      retryable: true,
    });
  });

  it('todos los códigos propios tienen mensaje en español', () => {
    for (const message of Object.values(EVIDENCE_UPLOAD_MESSAGES)) {
      expect(message.trim()).not.toBe('');
    }
  });
});

describe('token de la sesión del cliente de Supabase', () => {
  it('devuelve el access_token de la sesión', async () => {
    const client = {
      auth: {
        getSession: async () => ({
          data: { session: { access_token: TOKEN } },
          error: null,
        }),
      },
    };
    expect(await getAccessToken(client)).toBe(TOKEN);
  });

  it.each([
    ['sin sesión', { data: { session: null }, error: null }],
    ['con error', { data: { session: null }, error: new Error('x') }],
  ])('devuelve null %s', async (_case, reply) => {
    const client = { auth: { getSession: async () => reply } };
    expect(await getAccessToken(client)).toBeNull();
  });

  it('con el cliente real del navegador, sin HU-11 no hay sesión', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.com');
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'sb_publishable_unit_test_only',
    );
    expect(await getAccessToken()).toBeNull();
  });
});
