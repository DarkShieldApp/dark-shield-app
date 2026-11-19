import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import { GET } from '../src/app/api/reports/route';
import * as supabaseServer from '../src/server/supabase';
import {
  QUERY_ERROR_CODES,
  QUERY_ERROR_MESSAGES,
  resolveQueryState,
  type ReportQueryResult,
} from '../src/lib/reports/query';
import {
  REPORTS_PAGE_SIZE,
  fetchReportsPage,
  mergeReportPages,
  type ReportSearchQuery,
} from '../src/lib/reports/search';
import {
  COMMUNITY_NOTICE,
  CREDIBILITY_INSUFFICIENT,
  CREDIBILITY_LEVEL_LABELS,
  CREDIBILITY_UNAVAILABLE,
  toReportSummaryView,
} from '../src/lib/reports/summary';
import { normalizeReportTarget, queryReports } from '../src/server/reports';

/**
 * HU-01/T8 — pruebas de aceptación de la consulta de páginas y reportes
 * asociados. Completan `reports-query.test.ts` y `report-summary.test.ts` con
 * una tabla `reports` en memoria que aplica los mismos filtros, orden, límite
 * y proyección que pide `queryReports`, de modo que se comprueba el resultado
 * y no solo la forma de la llamada a PostgREST.
 */

interface StoredReport {
  id: string;
  author_id: string;
  title: string;
  description: string;
  pattern_type: string | null;
  target_url: string;
  page_key: string;
  target_host: string;
  registrable_domain: string;
  created_at: string;
}

type RpcResponse = { data: unknown; error: { message: string } | null };

interface InMemoryOptions {
  queryError?: { message: string };
  rpc?: (fn: string, args: { report_ids: string[] }) => RpcResponse;
}

// Mensaje en español: palabras funcionales frecuentes o letras propias.
const SPANISH = /[áéíóúñ¿¡]|\b(el|la|los|las|de|del|no|un|una|debe|debes)\b/i;

// Columnas que `anon` no puede leer (migraciones de lectura pública y
// `reports_hide_target_url_from_anon`, comprobadas con pgTAP).
const ANON_HIDDEN_COLUMNS = new Set(['author_id', 'target_url']);

// Único filtro `or` que construye `queryReports` (cursor de paginación).
const CURSOR_FILTER =
  /^created_at\.lt\.([^,()]+),and\(created_at\.eq\.([^,()]+),id\.lt\.([^,()]+)\)$/;

function createInMemoryClient(
  rows: StoredReport[],
  options: InMemoryOptions = {},
) {
  const writes = {
    insert: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  };

  const from = vi.fn((table: string) => {
    const filters: Array<(row: StoredReport) => boolean> = [];
    const orders: Array<{ column: keyof StoredReport; ascending: boolean }> =
      [];
    let limit = Number.POSITIVE_INFINITY;
    let columns: string[] = [];

    const execute = () => {
      if (options.queryError) return { data: null, error: options.queryError };
      const hidden = columns.filter((column) =>
        ANON_HIDDEN_COLUMNS.has(column),
      );
      if (hidden.length > 0) {
        return {
          data: null,
          error: { message: `permission denied for column ${hidden[0]}` },
        };
      }
      const data = rows
        .filter((row) => filters.every((filter) => filter(row)))
        .sort((a, b) => {
          for (const { column, ascending } of orders) {
            const left = String(a[column]);
            const right = String(b[column]);
            if (left !== right) {
              return (left < right ? -1 : 1) * (ascending ? 1 : -1);
            }
          }
          return 0;
        })
        .slice(0, limit)
        .map((row) =>
          Object.fromEntries(
            columns.map((column) => [
              column,
              row[column as keyof StoredReport],
            ]),
          ),
        );
      return { data, error: null };
    };

    const builder = {
      select: (selection: string) => {
        columns = selection.split(',').map((column) => column.trim());
        return builder;
      },
      eq: (column: keyof StoredReport, value: string) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      or: (expression: string) => {
        const match = CURSOR_FILTER.exec(expression);
        if (!match) throw new Error(`Filtro or no previsto: ${expression}`);
        const [, before, sameAt, beforeId] = match as unknown as [
          string,
          string,
          string,
          string,
        ];
        filters.push(
          (row) =>
            row.created_at < before ||
            (row.created_at === sameAt && row.id < beforeId),
        );
        return builder;
      },
      order: (
        column: keyof StoredReport,
        { ascending }: { ascending: boolean },
      ) => {
        orders.push({ column, ascending });
        return builder;
      },
      limit: (count: number) => {
        limit = count;
        return builder;
      },
      insert: (...args: unknown[]) => {
        writes.insert(table, ...args);
        return builder;
      },
      update: (...args: unknown[]) => {
        writes.update(table, ...args);
        return builder;
      },
      upsert: (...args: unknown[]) => {
        writes.upsert(table, ...args);
        return builder;
      },
      delete: (...args: unknown[]) => {
        writes.delete(table, ...args);
        return builder;
      },
      then: (
        onfulfilled?: (value: unknown) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(execute()).then(onfulfilled, onrejected),
    };
    return builder;
  });

  const rpc = vi.fn(
    async (fn: string, args: { report_ids: string[] }): Promise<RpcResponse> =>
      options.rpc ? options.rpc(fn, args) : { data: [], error: null },
  );

  return {
    client: { from, rpc } as unknown as SupabaseClient,
    from,
    rpc,
    writes,
  };
}

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

/** Reporte guardado con las claves que calcula la creación (HU-05). */
function storedReport(
  n: number,
  targetUrl: string,
  overrides: Partial<StoredReport> = {},
): StoredReport {
  const target = normalizeReportTarget(targetUrl);
  return {
    id: uuid(n),
    author_id: `ffffffff-0000-4000-8000-${n.toString(16).padStart(12, '0')}`,
    title: `Reporte ${n}`,
    description: 'Casilla de suscripción marcada por defecto.',
    pattern_type: 'sneaking',
    target_url: target.targetUrl,
    page_key: target.pageKey,
    target_host: target.targetHost,
    registrable_domain: target.registrableDomain,
    created_at: '2026-11-19T10:00:00.000000+00:00',
    ...overrides,
  };
}

function useClient(client: SupabaseClient) {
  return vi
    .spyOn(supabaseServer, 'createServerSupabaseClient')
    .mockReturnValue(client);
}

function getReports(query: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/reports?${query}`));
}

/** `fetch` del cliente servido por el handler real (sin red). */
const fetchThroughRoute: typeof fetch = async (input, init) =>
  GET(new Request(new URL(String(input), 'http://localhost'), init));

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.com');
  vi.stubEnv(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'sb_publishable_unit_test_only',
  );
});

describe('HU01-FL-01 — la consulta es de solo lectura', () => {
  const rows = [
    storedReport(1, 'https://tienda.example.com/checkout?promo=1'),
    storedReport(2, 'https://tienda.example.com/checkout', {
      created_at: '2026-11-18T10:00:00.000000+00:00',
    }),
  ];

  it.each([
    [
      'página con resultados',
      'scope=page&target=https://tienda.example.com/checkout',
    ],
    ['dominio con resultados', 'scope=domain&target=example.com'],
    ['página sin reportes', 'scope=page&target=https://example.com/limpia'],
    ['segunda página con cursor', 'scope=domain&target=example.com&limit=1'],
  ])('GET (%s) no inserta, actualiza ni borra nada', async (_case, query) => {
    const { client, from, rpc, writes } = createInMemoryClient(rows);
    useClient(client);

    const first = await getReports(query);
    expect(first.status).toBe(200);
    const { nextCursor } = (await first.json()) as ReportQueryResult;
    if (nextCursor) {
      const next = await getReports(
        `${query}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      expect(next.status).toBe(200);
    }

    expect(writes.insert).not.toHaveBeenCalled();
    expect(writes.update).not.toHaveBeenCalled();
    expect(writes.upsert).not.toHaveBeenCalled();
    expect(writes.delete).not.toHaveBeenCalled();
    expect(from.mock.calls.every(([table]) => table === 'reports')).toBe(true);
    expect(
      rpc.mock.calls.every(([fn]) => fn === 'report_credibility_inputs'),
    ).toBe(true);
  });

  it('tampoco escribe cuando la consulta falla', async () => {
    const { client, writes } = createInMemoryClient(rows, {
      queryError: { message: 'connection lost' },
    });
    useClient(client);

    expect((await getReports('scope=domain&target=example.com')).status).toBe(
      500,
    );
    expect(
      Object.values(writes).every((spy) => spy.mock.calls.length === 0),
    ).toBe(true);
  });
});

describe('HU01-FL-02 / CA1 — correspondencia por página y por dominio', () => {
  const rows = [
    storedReport(1, 'https://example.com/a'),
    storedReport(2, 'https://tienda.example.com/checkout?promo=1#paso2'),
    storedReport(3, 'https://a.b.example.com/x'),
    storedReport(4, 'https://WWW.Example.com:443/a'),
    storedReport(5, 'https://notexample.com/a'),
    storedReport(6, 'https://example.com.attacker.test/login'),
    storedReport(7, 'https://example.co.uk/'),
    storedReport(8, 'https://tienda.example.com/checkout/'),
    storedReport(9, 'http://tienda.example.com/checkout'),
    storedReport(10, 'https://tienda.example.com/otra'),
  ].map((row, index) => ({
    ...row,
    created_at: `2026-11-19T10:00:${String(59 - index).padStart(2, '0')}.000000+00:00`,
  }));

  const idsOf = (result: ReportQueryResult) =>
    result.items.map(({ id }) => id).sort();

  it.each([
    'example.com',
    'EXAMPLE.com',
    'tienda.example.com',
    'https://a.b.example.com/cualquier/ruta?x=1',
  ])(
    'scope=domain (%s) incluye el dominio y sus subdominios y nada más',
    async (target) => {
      const { client } = createInMemoryClient(rows);
      const result = await queryReports({ scope: 'domain', target }, client);

      expect(idsOf(result)).toEqual([1, 2, 3, 4, 8, 9, 10].map(uuid).sort());
    },
  );

  it.each([
    ['notexample.com', [5]],
    ['example.com.attacker.test', [6]],
    ['example.co.uk', [7]],
  ])(
    'un dominio parecido (%s) no devuelve reportes de example.com',
    async (target, expected) => {
      const { client } = createInMemoryClient(rows);
      const result = await queryReports({ scope: 'domain', target }, client);

      expect(idsOf(result)).toEqual(expected.map(uuid));
    },
  );

  it('scope=page solo devuelve la misma página, sin importar query ni fragmento', async () => {
    const { client } = createInMemoryClient(rows);
    const result = await queryReports(
      {
        scope: 'page',
        target: 'https://TIENDA.example.com:443/checkout?utm=1#arriba',
      },
      client,
    );

    // Fuera: barra final (8), otro esquema (9) y otra ruta (10).
    expect(idsOf(result)).toEqual([uuid(2)]);
  });

  it('una página de otro sitio no coincide aunque comparta la ruta', async () => {
    const { client } = createInMemoryClient(rows);
    const result = await queryReports(
      { scope: 'page', target: 'https://example.com.attacker.test/a' },
      client,
    );

    expect(result).toEqual({ items: [], nextCursor: null });
  });
});

describe('HU01-FL-03 / CA2 — vacío no es error', () => {
  it('una página sin reportes es 200 con lista vacía y el cliente la presenta como vacío', async () => {
    const { client } = createInMemoryClient([
      storedReport(1, 'https://otra.test/a'),
    ]);
    useClient(client);
    const query: ReportSearchQuery = {
      scope: 'page',
      target: 'https://example.com/limpia',
    };

    const outcome = await fetchReportsPage(query, null, {
      fetchImpl: fetchThroughRoute,
    });
    expect(outcome).toEqual({ result: { items: [], nextCursor: null } });

    const state = resolveQueryState({ result: outcome.result, query });
    expect(state).toMatchObject({
      status: 'empty',
      target: query.target,
      scope: 'page',
    });
    expect(state.status === 'empty' && state.message).toMatch(
      /No se encontraron reportes/,
    );
  });

  it('un fallo de la base de datos es 500 QUERY_FAILED, sin items, y el cliente puede reintentar', async () => {
    const { client } = createInMemoryClient(
      [storedReport(1, 'https://example.com/a')],
      { queryError: { message: 'connection lost' } },
    );
    useClient(client);

    const response = await getReports('scope=domain&target=example.com');
    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('items');
    expect(body.error).toMatchObject({ code: QUERY_ERROR_CODES.QUERY_FAILED });

    const outcome = await fetchReportsPage(
      { scope: 'domain', target: 'example.com' },
      null,
      { fetchImpl: fetchThroughRoute },
    );
    expect(outcome.result).toBeUndefined();
    expect(resolveQueryState({ error: outcome.error })).toMatchObject({
      status: 'error',
      code: QUERY_ERROR_CODES.QUERY_FAILED,
      canRetry: true,
    });
  });

  it('una excepción inesperada es 500 INTERNAL_ERROR, nunca una lista vacía', async () => {
    const client = {
      from: vi.fn(() => {
        throw new Error('fallo inesperado');
      }),
      rpc: vi.fn(),
    } as unknown as SupabaseClient;
    useClient(client);

    const response = await getReports(
      'scope=page&target=https://example.com/a',
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('items');
    expect(body.error).toEqual({
      code: QUERY_ERROR_CODES.INTERNAL_ERROR,
      message: 'Error inesperado al consultar los reportes.',
    });
  });

  it('una lectura denegada por permisos de columna es un error, no un vacío', async () => {
    // Si la proyección pidiera una columna oculta a anon, PostgREST fallaría:
    // el handler debe responder error, nunca `items: []`.
    const { client } = createInMemoryClient([], {
      queryError: { message: 'permission denied for column author_id' },
    });

    await expect(
      queryReports({ scope: 'domain', target: 'example.com' }, client),
    ).rejects.toMatchObject({ status: 500, code: 'QUERY_FAILED' });
  });
});

describe('HU-01 — paginación estable con created_at empatado', () => {
  const TIE = '2026-11-19T10:00:00.123456+00:00';
  // 23 reportes: 15 con la misma marca (microsegundos, como PostgREST), uno
  // un microsegundo antes y después, y el resto en otras fechas. Se guardan
  // desordenados para que el orden de inserción no influya.
  const rows: StoredReport[] = [
    ...Array.from({ length: 15 }, (_, i) =>
      storedReport(100 + ((i * 7) % 15), 'https://example.com/a', {
        created_at: TIE,
      }),
    ),
    storedReport(200, 'https://example.com/a', {
      created_at: '2026-11-19T10:00:00.123457+00:00',
    }),
    storedReport(201, 'https://example.com/a', {
      created_at: '2026-11-19T10:00:00.123455+00:00',
    }),
    ...Array.from({ length: 6 }, (_, i) =>
      storedReport(300 + i, 'https://example.com/a', {
        created_at: `2026-11-1${i}T08:00:00.000000+00:00`,
      }),
    ),
  ].reverse();

  const expectedOrder = [...rows]
    .sort((a, b) =>
      a.created_at === b.created_at
        ? a.id < b.id
          ? 1
          : -1
        : a.created_at < b.created_at
          ? 1
          : -1,
    )
    .map(({ id }) => id);

  it.each([1, 2, 3, 7, 15, 22, 23, 100])(
    'con limit=%i recorre todos los reportes sin repetir ni perder ninguno',
    async (limit) => {
      const { client } = createInMemoryClient(rows);
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const page: ReportQueryResult = await queryReports(
          {
            scope: 'page',
            target: 'https://example.com/a',
            limit,
            ...(cursor ? { cursor } : {}),
          },
          client,
        );
        expect(page.items.length).toBeLessThanOrEqual(limit);
        seen.push(...page.items.map(({ id }) => id));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < 50);

      expect(cursor).toBeNull();
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual(expectedOrder);
      expect(pages).toBe(Math.max(1, Math.ceil(rows.length / limit)));
    },
  );

  it('el cliente pagina por HTTP con el tamaño por defecto y obtiene la misma lista', async () => {
    const { client } = createInMemoryClient(rows);
    useClient(client);
    const query: ReportSearchQuery = {
      scope: 'domain',
      target: 'example.com',
    };

    const raw: string[] = [];
    let merged: ReportQueryResult | null = null;
    let cursor: string | null = null;
    do {
      const outcome = await fetchReportsPage(query, cursor, {
        fetchImpl: fetchThroughRoute,
      });
      if (!outcome.result) throw new Error('La página no debía fallar');
      raw.push(...outcome.result.items.map(({ id }) => id));
      merged = merged
        ? mergeReportPages(merged, outcome.result)
        : outcome.result;
      cursor = outcome.result.nextCursor;
    } while (cursor);

    // Sin repetidos ya en las páginas, antes de que `mergeReportPages` los filtre.
    expect(raw).toEqual(expectedOrder);
    expect(merged?.items.map(({ id }) => id)).toEqual(expectedOrder);
    expect(Math.ceil(rows.length / REPORTS_PAGE_SIZE)).toBe(3);
  });
});

describe('HU01-FL-07 — proyección pública del listado', () => {
  it('cada item del GET tiene exactamente los campos públicos', async () => {
    const { client } = createInMemoryClient([
      storedReport(1, 'https://tienda.example.com/checkout?session=abc#pago'),
    ]);
    useClient(client);

    const response = await getReports('scope=domain&target=example.com');
    expect(response.status).toBe(200);
    const body = (await response.json()) as ReportQueryResult;

    expect(Object.keys(body).sort()).toEqual(['items', 'nextCursor']);
    const [only] = body.items;
    expect(Object.keys(only ?? {}).sort()).toEqual([
      'created_at',
      'credibility',
      'description',
      'id',
      'page_key',
      'pattern_type',
      'target_url',
      'title',
    ]);
    expect(only?.target_url).toBe('https://tienda.example.com/checkout');
    const raw = JSON.stringify(body);
    for (const secret of [
      'ffffffff-',
      'author_id',
      'session=abc',
      '#pago',
      'registrable_domain',
      'target_host',
    ]) {
      expect(raw).not.toContain(secret);
    }
  });
});

describe('HU-01 — errores en español con códigos estables', () => {
  it('el catálogo de códigos no cambia y cada código tiene mensaje en español', () => {
    expect(Object.values(QUERY_ERROR_CODES)).toEqual([
      'MISSING_QUERY_TARGET',
      'INVALID_QUERY_TARGET',
      'INVALID_TARGET_URL',
      'INVALID_TARGET_DOMAIN',
      'INVALID_QUERY_SCOPE',
      'INVALID_QUERY_LIMIT',
      'INVALID_QUERY_CURSOR',
      'SERVICE_UNAVAILABLE',
      'QUERY_FAILED',
      'INTERNAL_ERROR',
    ]);
    for (const code of Object.values(QUERY_ERROR_CODES)) {
      expect(QUERY_ERROR_MESSAGES[code]).toMatch(SPANISH);
    }
  });

  it.each([
    ['MISSING_QUERY_TARGET', 'scope=page'],
    ['MISSING_QUERY_TARGET', 'scope=page&target=%20%20'],
    ['INVALID_QUERY_TARGET', 'scope=page&target=https://example.com/%01'],
    [
      'INVALID_QUERY_TARGET',
      `scope=page&target=https://example.com/${'a'.repeat(2048)}`,
    ],
    ['INVALID_TARGET_URL', 'scope=page&target=example.com'],
    ['INVALID_TARGET_URL', 'scope=page&target=ftp://example.com/a'],
    ['INVALID_TARGET_URL', 'scope=page&target=https://u:p@example.com/'],
    ['INVALID_TARGET_DOMAIN', 'scope=domain&target=co.uk'],
    ['INVALID_TARGET_DOMAIN', 'scope=domain&target=192.168.1.1'],
    ['INVALID_QUERY_SCOPE', 'scope=site&target=example.com'],
    ['INVALID_QUERY_SCOPE', 'target=example.com'],
    ['INVALID_QUERY_LIMIT', 'scope=domain&target=example.com&limit=0'],
    ['INVALID_QUERY_LIMIT', 'scope=domain&target=example.com&limit=1.5'],
    ['INVALID_QUERY_CURSOR', 'scope=domain&target=example.com&cursor=xyz'],
  ])(
    '400 %s (%s) en español y sin consultar la base de datos',
    async (code, query) => {
      const factory = useClient(createInMemoryClient([]).client);

      const response = await getReports(query);

      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        error: { code: string; message: string };
        items?: unknown;
      };
      expect(body.items).toBeUndefined();
      expect(body.error.code).toBe(code);
      expect(body.error.message).toMatch(SPANISH);
      expect(factory).not.toHaveBeenCalled();
    },
  );

  it('503 SERVICE_UNAVAILABLE y 500 QUERY_FAILED también responden en español', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
    const unavailable = await getReports('scope=domain&target=example.com');
    expect(unavailable.status).toBe(503);
    expect(
      ((await unavailable.json()) as { error: { message: string } }).error
        .message,
    ).toMatch(SPANISH);

    const { client } = createInMemoryClient([], {
      queryError: { message: 'connection lost' },
    });
    useClient(client);
    const failed = await getReports('scope=domain&target=example.com');
    const failedBody = (await failed.json()) as {
      error: { code: string; message: string };
    };
    expect(failedBody.error.code).toBe('QUERY_FAILED');
    expect(failedBody.error.message).toMatch(SPANISH);
    expect(failedBody.error.message).not.toContain('connection lost');
  });
});

describe('HU01-FL-04 — reportes, no veredictos', () => {
  it('el resumen avisa de que el reporte es comunitario y no un veredicto', () => {
    expect(COMMUNITY_NOTICE).toBe('Reporte comunitario, no es un veredicto');
  });

  it('ninguna etiqueta de credibilidad afirma que el patrón esté confirmado', () => {
    const labels = [
      CREDIBILITY_UNAVAILABLE,
      CREDIBILITY_INSUFFICIENT,
      ...Object.values(CREDIBILITY_LEVEL_LABELS),
    ];
    for (const label of labels) {
      expect(label).not.toMatch(/confirm|verific|cierto|probado|garant/i);
    }
  });
});

// Agregados de `report_credibility_inputs` (formato de la RPC, snake_case).
function credibilityRow(
  reportId: string,
  aggregates: {
    evidences?: number;
    validations?: number;
    validationTrust?: number;
    invalidations?: number;
    invalidationTrust?: number;
  } = {},
): Record<string, unknown> {
  const {
    evidences = 0,
    validations = 0,
    validationTrust = 100,
    invalidations = 0,
    invalidationTrust = 100,
  } = aggregates;
  return {
    report_id: reportId,
    report_created_at: '2026-11-18T10:00:00.000Z',
    visible_evidences: evidences,
    latest_evidence_at: evidences > 0 ? '2026-11-19T08:00:00.000Z' : null,
    validations,
    validation_trust_sum: validations * validationTrust,
    invalidations,
    invalidation_trust_sum: invalidations * invalidationTrust,
    latest_assessment_at:
      validations + invalidations > 0 ? '2026-11-19T09:00:00.000Z' : null,
  };
}

function rpcFrom(byId: Map<string, Record<string, unknown>>) {
  return (_fn: string, { report_ids }: { report_ids: string[] }) => ({
    data: report_ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    }),
    error: null,
  });
}

async function viewsThroughHttp(query: ReportSearchQuery) {
  const outcome = await fetchReportsPage(query, null, {
    fetchImpl: fetchThroughRoute,
  });
  if (!outcome.result) throw new Error('La consulta no debía fallar');
  return outcome.result.items.map((item) => ({
    item,
    view: toReportSummaryView(item),
  }));
}

describe('HU01-FL-06 / CA4 — no se da por cierto un reporte sin credibilidad suficiente', () => {
  const query: ReportSearchQuery = { scope: 'domain', target: 'example.com' };

  it('servidor → HTTP → resumen: «Alta», «Datos insuficientes» y «no disponible»', async () => {
    const rows = [1, 2, 3].map((n) =>
      storedReport(n, `https://example.com/${n}`, {
        created_at: `2026-11-19T10:00:0${9 - n}.000000+00:00`,
      }),
    );
    const { client } = createInMemoryClient(rows, {
      rpc: rpcFrom(
        new Map([
          // Tres validaciones de confianza máxima: alta con datos suficientes.
          [uuid(1), credibilityRow(uuid(1), { validations: 3 })],
          // Una sola validación de confianza máxima: insuficiente.
          [uuid(2), credibilityRow(uuid(2), { validations: 1, evidences: 4 })],
          // uuid(3) sin resultado.
        ]),
      ),
    });
    useClient(client);

    const views = await viewsThroughHttp(query);

    expect(views.map(({ view }) => view.credibility)).toEqual([
      { status: 'high', label: 'Alta' },
      { status: 'insufficient', label: CREDIBILITY_INSUFFICIENT },
      { status: 'unavailable', label: CREDIBILITY_UNAVAILABLE },
    ]);
    expect(views[1]?.item.credibility).toMatchObject({ sufficientData: false });
  });

  it('si la RPC falla, todos quedan «Credibilidad no disponible» y la lista se mantiene', async () => {
    const rows = [1, 2].map((n) => storedReport(n, `https://example.com/${n}`));
    const { client } = createInMemoryClient(rows, {
      rpc: () => ({ data: null, error: { message: 'RPC caída' } }),
    });
    useClient(client);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const views = await viewsThroughHttp(query);

    expect(views).toHaveLength(2);
    for (const { item, view } of views) {
      expect(item.credibility).toBeNull();
      expect(view.credibility).toEqual({
        status: 'unavailable',
        label: CREDIBILITY_UNAVAILABLE,
      });
    }
  });

  it('en ningún escenario de agregados aparece «Alta» sin datos suficientes', async () => {
    // 72 combinaciones de evidencias, validaciones e invalidaciones.
    const byId = new Map<string, Record<string, unknown>>();
    const rows: StoredReport[] = [];
    let n = 0;
    for (const evidences of [0, 2, 4]) {
      for (const validations of [0, 1, 2, 3]) {
        for (const validationTrust of [1, 100]) {
          for (const invalidations of [0, 1, 2]) {
            n += 1;
            rows.push(
              storedReport(n, `https://example.com/${n}`, {
                created_at: `2026-11-19T10:00:00.${String(n).padStart(6, '0')}+00:00`,
              }),
            );
            byId.set(
              uuid(n),
              credibilityRow(uuid(n), {
                evidences,
                validations,
                validationTrust,
                invalidations,
              }),
            );
          }
        }
      }
    }
    const { client } = createInMemoryClient(rows, { rpc: rpcFrom(byId) });
    const result = await queryReports({ ...query, limit: 100 }, client);
    expect(result.items).toHaveLength(72);

    const labels = new Set<string>();
    for (const item of result.items) {
      const { label } = toReportSummaryView(item).credibility;
      labels.add(label);
      expect(item.credibility).not.toBeNull();
      if (item.credibility?.sufficientData !== true) {
        expect(label).toBe(CREDIBILITY_INSUFFICIENT);
      }
      if (label === CREDIBILITY_LEVEL_LABELS.high) {
        expect(item.credibility).toMatchObject({
          sufficientData: true,
          level: 'high',
        });
      }
    }
    // La propiedad no es vacía: hay casos de las dos clases.
    expect(labels).toContain(CREDIBILITY_LEVEL_LABELS.high);
    expect(labels).toContain(CREDIBILITY_INSUFFICIENT);
  });
});
