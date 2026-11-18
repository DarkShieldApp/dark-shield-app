import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import { GET } from '../src/app/api/reports/route';
import * as supabaseServer from '../src/server/supabase';
import {
  QUERY_ERROR_CODES,
  QUERY_ERROR_MESSAGES,
  resolveQueryState,
} from '../src/lib/reports/query';
import {
  decodeCursor,
  encodeCursor,
  parseAndValidateQueryParams,
  queryReports,
  ReportApiError,
} from '../src/server/reports';

const SAMPLE_ROW_1 = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  author_id: 'user-1',
  title: 'Suscripción oculta en checkout',
  description:
    'Se marca automáticamente una casilla de suscripción recurrente.',
  pattern_type: 'sneaking',
  target_url: 'https://tienda.example.com/checkout?promo=1#paso2',
  page_key: 'https://tienda.example.com/checkout',
  target_host: 'tienda.example.com',
  registrable_domain: 'example.com',
  created_at: '2026-11-18T10:00:00.000Z',
};

const SAMPLE_ROW_2 = {
  id: 'bbbbbbbb-1111-2222-3333-444444444444',
  author_id: 'user-2',
  title: 'Costes sorpresa de envío',
  description: 'Aparecen 10 euros adicionales en el último paso.',
  pattern_type: 'hidden_costs',
  target_url: 'https://tienda.example.com/checkout',
  page_key: 'https://tienda.example.com/checkout',
  target_host: 'tienda.example.com',
  registrable_domain: 'example.com',
  created_at: '2026-11-17T10:00:00.000Z',
};

function createMockSupabaseQueryClient(options: {
  data?: unknown[];
  error?: Error | null;
}) {
  const queryBuilder: Record<string, unknown> = {};

  queryBuilder.select = vi.fn(() => queryBuilder);
  queryBuilder.order = vi.fn(() => queryBuilder);
  queryBuilder.limit = vi.fn(() => queryBuilder);
  queryBuilder.eq = vi.fn(() => queryBuilder);
  queryBuilder.or = vi.fn(() => queryBuilder);

  // Thenable for awaiting query
  queryBuilder.then = (
    onfulfilled?: (value: unknown) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => {
    if (options.error) {
      return Promise.resolve({ data: null, error: options.error }).then(
        onfulfilled,
        onrejected,
      );
    }
    return Promise.resolve({ data: options.data ?? [], error: null }).then(
      onfulfilled,
      onrejected,
    );
  };

  const client = {
    from: vi.fn(() => queryBuilder),
  };

  return { client: client as unknown as SupabaseClient, queryBuilder };
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.com');
  vi.stubEnv(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'sb_publishable_unit_test_only',
  );
});

describe('resolveQueryState (gestión de estados vacíos y errores en cliente)', () => {
  it('devuelve estado loading cuando isLoading es true', () => {
    expect(resolveQueryState({ isLoading: true })).toEqual({
      status: 'loading',
    });
  });

  it('devuelve estado idle cuando no hay parámetros de resultado ni error', () => {
    expect(resolveQueryState({})).toEqual({ status: 'idle' });
  });

  it('diferencia correctamente página sin reportes (vacío) de un error', () => {
    const emptyResult = resolveQueryState({
      result: { items: [], nextCursor: null },
      query: { target: 'https://ejemplo.com/sin-reportes', scope: 'page' },
    });

    expect(emptyResult.status).toBe('empty');
    if (emptyResult.status === 'empty') {
      expect(emptyResult.target).toBe('https://ejemplo.com/sin-reportes');
      expect(emptyResult.scope).toBe('page');
      expect(emptyResult.message).toContain('No se encontraron reportes');
    }

    const emptyWithoutQuery = resolveQueryState({
      result: { items: [], nextCursor: null },
    });
    expect(emptyWithoutQuery).toEqual({
      status: 'empty',
      message:
        'No se encontraron reportes asociados a la página o dominio consultado.',
      target: '',
      scope: 'page',
    });
  });

  it('devuelve estado success cuando hay reportes', () => {
    const successResult = resolveQueryState({
      result: {
        items: [
          {
            id: '1',
            title: 'Test',
            description: 'Desc',
            pattern_type: 'other',
            target_url: 'https://a.com',
            page_key: 'https://a.com',
            created_at: '2026-11-18',
          },
        ],
        nextCursor: 'cursor-123',
      },
    });

    expect(successResult.status).toBe('success');
    if (successResult.status === 'success') {
      expect(successResult.items).toHaveLength(1);
      expect(successResult.nextCursor).toBe('cursor-123');
    }
  });

  it('gestiona errores de consulta distinguiendo reintentables y usando mensajes estándar', () => {
    const dbError = resolveQueryState({
      error: { code: QUERY_ERROR_CODES.QUERY_FAILED },
    });
    expect(dbError).toEqual({
      status: 'error',
      code: 'QUERY_FAILED',
      message: QUERY_ERROR_MESSAGES.QUERY_FAILED,
      canRetry: true,
    });

    const validationError = resolveQueryState({
      error: { code: QUERY_ERROR_CODES.INVALID_TARGET_URL },
    });
    expect(validationError).toEqual({
      status: 'error',
      code: 'INVALID_TARGET_URL',
      message: QUERY_ERROR_MESSAGES.INVALID_TARGET_URL,
      canRetry: false,
    });

    const customError = resolveQueryState({
      error: { code: 'CUSTOM', message: 'Mensaje personalizado' },
    });
    expect(customError).toEqual({
      status: 'error',
      code: 'CUSTOM',
      message: 'Mensaje personalizado',
      canRetry: false,
    });

    const unknownCodeDefault = resolveQueryState({
      error: { code: 'UNKNOWN_CODE' },
    });
    expect(unknownCodeDefault.message).toBe(
      QUERY_ERROR_MESSAGES.INTERNAL_ERROR,
    );
  });
});

describe('validación de parámetros de consulta y cursores', () => {
  it('codifica y decodifica cursores opacos correctamente', () => {
    const encoded = encodeCursor('2026-11-18T10:00:00.000Z', 'id-123');
    expect(typeof encoded).toBe('string');
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual({
      createdAt: '2026-11-18T10:00:00.000Z',
      id: 'id-123',
    });
  });

  it('rechaza cursores corruptos o con formato inválido', () => {
    expect(() => decodeCursor('no-es-base64-valido!!!')).toThrow(
      ReportApiError,
    );
    expect(() =>
      decodeCursor(Buffer.from('{"createdAt": 123}').toString('base64url')),
    ).toThrow(ReportApiError);
  });

  it('rechaza consultas con scope inválido o ausente', () => {
    expect(() =>
      parseAndValidateQueryParams({ target: 'https://example.com' }),
    ).toThrow(ReportApiError);
    expect(() =>
      parseAndValidateQueryParams({
        target: 'https://example.com',
        scope: 'invalid',
      }),
    ).toThrow('debe ser "page" o "domain"');
  });

  it('rechaza consultas con target ausente, caracteres de control o excesivamente largo', () => {
    expect(() =>
      parseAndValidateQueryParams({ scope: 'page', target: '' }),
    ).toThrow(ReportApiError);
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'page',
        target: 'https://example.com/\u0000bad',
      }),
    ).toThrow('caracteres de control');
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'page',
        target: `https://example.com/${'x'.repeat(2045)}`,
      }),
    ).toThrow('supera la longitud máxima');
  });

  it('en scope=page valida URLs absolutas http/https y rechaza credenciales o protocolos no permitidos', () => {
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'page',
        target: 'ftp://example.com/file',
      }),
    ).toThrow('http o https');
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'page',
        target: 'https://user:pass@example.com/checkout',
      }),
    ).toThrow('credenciales');
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'page',
        target: 'no-es-url',
      }),
    ).toThrow('URL absoluta');

    const valid = parseAndValidateQueryParams({
      scope: 'page',
      target: 'https://Shop.Example.co.uk:443/Pricing?q=1#top',
    });
    expect(valid.lookupKey).toBe('https://shop.example.co.uk/Pricing');
    expect(valid.scope).toBe('page');
  });

  it('en scope=domain extrae dominio registrable y rechaza IPs, sufijos públicos o credenciales', () => {
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'domain',
        target: 'https://user:pass@shop.example.com',
      }),
    ).toThrow('credenciales');
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'domain',
        target: 'user@shop.example.com',
      }),
    ).toThrow('credenciales');
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'domain',
        target: '192.168.1.1',
      }),
    ).toThrow('direcciones IP solo se admiten en consultas con scope=page');
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'domain',
        target: 'co.uk',
      }),
    ).toThrow('sufijo público');
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'domain',
        target: 'com',
      }),
    ).toThrow('sufijo público');
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'domain',
        target: 'inva lid.com',
      }),
    ).toThrow('formato del dominio no es válido');

    const fromDomain = parseAndValidateQueryParams({
      scope: 'domain',
      target: 'Blog.Shop.Example.co.uk',
    });
    expect(fromDomain.lookupKey).toBe('example.co.uk');

    const fromUrl = parseAndValidateQueryParams({
      scope: 'domain',
      target: 'https://shop.example.com/any/path?param=1',
    });
    expect(fromUrl.lookupKey).toBe('example.com');
  });

  it('valida límites de paginación y cursores válidos', () => {
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'page',
        target: 'https://example.com',
        limit: '0',
      }),
    ).toThrow('entre 1 y 100');
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'page',
        target: 'https://example.com',
        limit: '101',
      }),
    ).toThrow('entre 1 y 100');
    expect(() =>
      parseAndValidateQueryParams({
        scope: 'page',
        target: 'https://example.com',
        limit: 'abc',
      }),
    ).toThrow('entre 1 y 100');

    const valid = parseAndValidateQueryParams({
      scope: 'page',
      target: 'https://example.com',
      limit: '50',
      cursor: encodeCursor('2026-11-18', 'id-1'),
    });
    expect(valid.limit).toBe(50);
    expect(valid.cursor).toEqual({ createdAt: '2026-11-18', id: 'id-1' });
  });
});

describe('queryReports (ejecución de consultas en servidor y casos límite)', () => {
  it('gestiona página sin reportes devolviendo lista vacía y nextCursor nulo (no error)', async () => {
    const { client } = createMockSupabaseQueryClient({ data: [] });

    const result = await queryReports(
      {
        scope: 'page',
        target: 'https://example.com/sin-reportes',
      },
      client,
    );

    expect(result).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('recupera reportes asociados a página con proyección de resumen pública', async () => {
    const { client, queryBuilder } = createMockSupabaseQueryClient({
      data: [SAMPLE_ROW_1, SAMPLE_ROW_2],
    });

    const result = await queryReports(
      {
        scope: 'page',
        target: 'https://tienda.example.com/checkout?q=1',
        limit: 10,
      },
      client,
    );

    expect(queryBuilder.eq).toHaveBeenCalledWith(
      'page_key',
      'https://tienda.example.com/checkout',
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      id: SAMPLE_ROW_1.id,
      title: SAMPLE_ROW_1.title,
      description: SAMPLE_ROW_1.description,
      pattern_type: SAMPLE_ROW_1.pattern_type,
      target_url: SAMPLE_ROW_1.target_url,
      page_key: SAMPLE_ROW_1.page_key,
      created_at: SAMPLE_ROW_1.created_at,
    });
    // No expone author_id
    expect(
      (result.items[0] as unknown as { author_id?: string }).author_id,
    ).toBeUndefined();
    expect(result.nextCursor).toBeNull();
  });

  it('recupera reportes asociados a dominio y genera cursor cuando hay más resultados que el límite', async () => {
    const { client, queryBuilder } = createMockSupabaseQueryClient({
      data: [SAMPLE_ROW_1, SAMPLE_ROW_2], // limit es 1, tenemos 2 filas devueltas (hasMore = true)
    });

    const result = await queryReports(
      {
        scope: 'domain',
        target: 'tienda.example.com',
        limit: 1,
      },
      client,
    );

    expect(queryBuilder.eq).toHaveBeenCalledWith(
      'registrable_domain',
      'example.com',
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(SAMPLE_ROW_1.id);
    expect(result.nextCursor).not.toBeNull();

    const decoded = decodeCursor(result.nextCursor!);
    expect(decoded.id).toBe(SAMPLE_ROW_1.id);
  });

  it('aplica cursor de paginación en la consulta cuando se proporciona', async () => {
    const { client, queryBuilder } = createMockSupabaseQueryClient({
      data: [SAMPLE_ROW_2],
    });

    const cursorStr = encodeCursor(SAMPLE_ROW_1.created_at, SAMPLE_ROW_1.id);

    await queryReports(
      {
        scope: 'page',
        target: 'https://tienda.example.com/checkout',
        cursor: cursorStr,
      },
      client,
    );

    expect(queryBuilder.or).toHaveBeenCalledWith(
      `created_at.lt.${SAMPLE_ROW_1.created_at},and(created_at.eq.${SAMPLE_ROW_1.created_at},id.lt.${SAMPLE_ROW_1.id})`,
    );
  });

  it('lanza ReportApiError(500) cuando la consulta de base de datos falla (nunca devuelve lista vacía ante error)', async () => {
    const { client } = createMockSupabaseQueryClient({
      error: new Error('Postgres connection lost'),
    });

    await expect(
      queryReports(
        {
          scope: 'page',
          target: 'https://example.com',
        },
        client,
      ),
    ).rejects.toMatchObject({
      status: 500,
      code: QUERY_ERROR_CODES.QUERY_FAILED,
    });
  });
});

describe('endpoint GET /api/reports', () => {
  it('devuelve 200 con lista vacía para páginas sin reportes', async () => {
    const { client } = createMockSupabaseQueryClient({ data: [] });
    vi.spyOn(supabaseServer, 'createServerSupabaseClient').mockReturnValue(
      client,
    );

    const req = new Request(
      'http://localhost/api/reports?scope=page&target=https://example.com/limpia',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('devuelve 200 con resultados formateados cuando hay reportes', async () => {
    const { client } = createMockSupabaseQueryClient({
      data: [SAMPLE_ROW_1],
    });
    vi.spyOn(supabaseServer, 'createServerSupabaseClient').mockReturnValue(
      client,
    );

    const req = new Request(
      'http://localhost/api/reports?scope=page&target=https://tienda.example.com/checkout',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(SAMPLE_ROW_1.id);
  });

  it('devuelve 400 con código estable ante parámetros inválidos', async () => {
    const reqNoScope = new Request(
      'http://localhost/api/reports?target=https://example.com',
    );
    const resNoScope = await GET(reqNoScope);
    expect(resNoScope.status).toBe(400);
    const bodyNoScope = await resNoScope.json();
    expect(bodyNoScope.error.code).toBe(QUERY_ERROR_CODES.INVALID_SCOPE);

    const reqBadLimit = new Request(
      'http://localhost/api/reports?scope=page&target=https://example.com&limit=999',
    );
    const resBadLimit = await GET(reqBadLimit);
    expect(resBadLimit.status).toBe(400);
    const bodyBadLimit = await resBadLimit.json();
    expect(bodyBadLimit.error.code).toBe(QUERY_ERROR_CODES.INVALID_LIMIT);
  });

  it('devuelve 503 cuando Supabase no está configurado en el servidor', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
    const req = new Request(
      'http://localhost/api/reports?scope=page&target=https://example.com',
    );
    const res = await GET(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
