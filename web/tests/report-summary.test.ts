import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { CredibilityResult } from '../src/server/credibility';

import {
  REPORT_CATEGORY_OPTIONS,
  UNKNOWN_CATEGORY_LABEL,
  getCategoryLabel,
} from '../src/lib/reports/categories';
import {
  QUERY_ERROR_MESSAGES,
  resolveQueryState,
  type ReportCredibilitySummary,
  type ReportSummaryItem,
  type ResolvedQueryState,
} from '../src/lib/reports/query';
import {
  INVALID_RESPONSE_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  REPORTS_PAGE_SIZE,
  buildReportsRequestUrl,
  describeQueryStatus,
  fetchReportsPage,
  mergeReportPages,
  parseReportsResponse,
  prepareQueryTarget,
} from '../src/lib/reports/search';
import {
  CREDIBILITY_DYNAMIC_NOTICE,
  CREDIBILITY_INSUFFICIENT,
  CREDIBILITY_LEVEL_LABELS,
  CREDIBILITY_UNAVAILABLE,
  EXCERPT_MAX_LENGTH,
  NO_DESCRIPTION,
  UNKNOWN_DATE,
  UNTITLED_REPORT,
  buildExcerpt,
  describeCredibility,
  displayPageUrl,
  formatReportDate,
  toReportSummaryView,
} from '../src/lib/reports/summary';
import { REPORT_CATEGORY_VALUES } from '../src/lib/reports/validation';

function item(overrides: Partial<ReportSummaryItem> = {}): ReportSummaryItem {
  return {
    id: 'aaaaaaaa-1111-2222-3333-444444444444',
    title: 'Suscripción oculta en checkout',
    description:
      'Se marca automáticamente una casilla de suscripción recurrente.\n\nPasos para reproducir:\n1. Añadir al carrito.',
    pattern_type: 'sneaking',
    target_url: 'https://tienda.example.com/checkout',
    page_key: 'https://tienda.example.com/checkout',
    created_at: '2026-11-19T10:00:00.000Z',
    ...overrides,
  };
}

describe('getCategoryLabel', () => {
  it('tiene una etiqueta para cada categoría válida', () => {
    expect(REPORT_CATEGORY_OPTIONS.map(({ value }) => value)).toEqual([
      ...REPORT_CATEGORY_VALUES,
    ]);
  });

  it('devuelve la etiqueta legible de una categoría conocida', () => {
    expect(getCategoryLabel('hidden_costs')).toBe(
      'Costes ocultos o cargos sorpresa (Hidden Costs)',
    );
  });

  it.each([null, undefined, '', 'desconocida', 'constructor'])(
    'no inventa etiqueta para %s',
    (value) => {
      expect(getCategoryLabel(value)).toBe(UNKNOWN_CATEGORY_LABEL);
    },
  );
});

describe('formatReportDate', () => {
  it('formatea en es-ES', () => {
    expect(formatReportDate('2026-11-19T10:00:00.000Z')).toBe(
      '19 de noviembre de 2026',
    );
  });

  it('usa la zona de Madrid, no la del entorno', () => {
    expect(formatReportDate('2026-11-18T23:30:00.000Z')).toBe(
      '19 de noviembre de 2026',
    );
  });

  it('no falla con una fecha inválida', () => {
    expect(formatReportDate('no-es-fecha')).toBe(UNKNOWN_DATE);
  });
});

describe('displayPageUrl', () => {
  it('quita query y fragmento', () => {
    expect(displayPageUrl(' https://a.example.com/p?token=1#x ')).toBe(
      'https://a.example.com/p',
    );
  });

  it('recorta también un valor que no es URL absoluta', () => {
    expect(displayPageUrl('a.example.com/p?x=1')).toBe('a.example.com/p');
  });
});

describe('buildExcerpt', () => {
  it('descarta la sección de pasos para reproducir', () => {
    expect(buildExcerpt(item().description)).toBe(
      'Se marca automáticamente una casilla de suscripción recurrente.',
    );
  });

  it('normaliza espacios y saltos de línea', () => {
    expect(buildExcerpt('  Uno\n\n dos\tTres  ')).toBe('Uno dos Tres');
  });

  it('no recorta un texto corto', () => {
    const text = 'a'.repeat(EXCERPT_MAX_LENGTH);
    expect(buildExcerpt(text)).toBe(text);
  });

  it('recorta en un límite de palabra y añade puntos suspensivos', () => {
    const text = `${'palabra '.repeat(40)}final`;
    const excerpt = buildExcerpt(text, 50);
    expect(excerpt.endsWith('palabra…')).toBe(true);
    expect(Array.from(excerpt).length).toBeLessThanOrEqual(51);
  });

  it('quita la puntuación final antes de los puntos suspensivos', () => {
    expect(buildExcerpt('Uno dos tres, cuatro cinco seis', 13)).toBe(
      'Uno dos tres…',
    );
  });

  it('corta sin espacio cercano sin partir emojis', () => {
    const text = '😀'.repeat(30);
    const excerpt = buildExcerpt(text, 10);
    expect(excerpt).toBe(`${'😀'.repeat(10)}…`);
    expect(excerpt).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('devuelve vacío si solo hay pasos', () => {
    expect(buildExcerpt('Pasos para reproducir:\n1. Algo')).toBe('');
  });
});

describe('toReportSummaryView', () => {
  it('prepara todos los campos del resumen', () => {
    expect(
      toReportSummaryView(
        item({ target_url: 'https://tienda.example.com/checkout?promo=1' }),
      ),
    ).toEqual({
      id: 'aaaaaaaa-1111-2222-3333-444444444444',
      title: 'Suscripción oculta en checkout',
      categoryLabel: 'Preselección o elementos añadidos sin permiso (Sneaking)',
      pageUrl: 'https://tienda.example.com/checkout',
      dateTime: '2026-11-19T10:00:00.000Z',
      dateLabel: '19 de noviembre de 2026',
      excerpt:
        'Se marca automáticamente una casilla de suscripción recurrente.',
      credibility: { status: 'unavailable', label: CREDIBILITY_UNAVAILABLE },
    });
  });

  it('incluye la etiqueta de credibilidad del reporte', () => {
    expect(
      toReportSummaryView(item({ credibility: credibility() })).credibility,
    ).toEqual({ status: 'high', label: 'Alta' });
  });

  it('usa textos por defecto sin título, categoría ni descripción', () => {
    const view = toReportSummaryView(
      item({ title: '  ', pattern_type: null, description: '   ' }),
    );
    expect(view.title).toBe(UNTITLED_REPORT);
    expect(view.categoryLabel).toBe(UNKNOWN_CATEGORY_LABEL);
    expect(view.excerpt).toBe(NO_DESCRIPTION);
  });
});

describe('prepareQueryTarget', () => {
  it('elimina query y fragmento para una página', () => {
    expect(
      prepareQueryTarget(
        ' https://tienda.example.com/checkout?promo=1#paso ',
        'page',
      ),
    ).toBe('https://tienda.example.com/checkout');
  });

  it('asume HTTPS sin esquema', () => {
    expect(prepareQueryTarget('tienda.example.com/a?b=1', 'page')).toBe(
      'https://tienda.example.com/a',
    );
  });

  it('envía solo el host para un dominio', () => {
    expect(
      prepareQueryTarget('http://Tienda.Example.com:8080/a?b=1', 'domain'),
    ).toBe('tienda.example.com');
  });

  it.each([
    '',
    '   ',
    'ftp://example.com/a',
    'javascript:alert(1)',
    'https://user:pass@example.com/',
    'https://',
  ])('rechaza %j', (value) => {
    expect(prepareQueryTarget(value, 'page')).toBeNull();
  });
});

describe('buildReportsRequestUrl', () => {
  it('codifica los parámetros y usa el tamaño de página por defecto', () => {
    expect(
      buildReportsRequestUrl({
        scope: 'page',
        target: 'https://a.example.com/x y',
      }),
    ).toBe(
      `/api/reports?scope=page&target=https%3A%2F%2Fa.example.com%2Fx+y&limit=${REPORTS_PAGE_SIZE}`,
    );
  });

  it('añade el cursor y el límite', () => {
    expect(
      buildReportsRequestUrl(
        { scope: 'domain', target: 'example.com' },
        'abc',
        5,
      ),
    ).toBe('/api/reports?scope=domain&target=example.com&limit=5&cursor=abc');
  });
});

function credibility(
  overrides: Partial<ReportCredibilitySummary> = {},
): ReportCredibilitySummary {
  return {
    level: 'high',
    score: 80,
    sufficientData: true,
    updatedAt: '2026-11-19T09:00:00.000Z',
    factors: {
      visibleEvidences: 0,
      validations: 3,
      invalidations: 0,
      assessors: 3,
      supportWeight: 3,
      againstWeight: 0,
    },
    ...overrides,
  };
}

describe('HU-01/T7 — tipo compartido de credibilidad', () => {
  it('el resultado del servidor es asignable al resumen del cliente', () => {
    expectTypeOf<CredibilityResult>().toExtend<ReportCredibilitySummary>();
    expectTypeOf<ReportCredibilitySummary>().toExtend<CredibilityResult>();
  });
});

describe('HU-01/T7 — describeCredibility', () => {
  it.each([
    [undefined, 'unavailable', CREDIBILITY_UNAVAILABLE],
    [null, 'unavailable', CREDIBILITY_UNAVAILABLE],
  ] as const)('sin credibilidad (%s) no la inventa', (value, status, label) => {
    expect(describeCredibility(value)).toEqual({ status, label });
  });

  it.each([
    ['high', 'Alta'],
    ['medium', 'Media'],
    ['low', 'Baja'],
  ] as const)('con datos suficientes, nivel %s → «%s»', (level, label) => {
    expect(describeCredibility(credibility({ level }))).toEqual({
      status: level,
      label,
    });
    expect(CREDIBILITY_LEVEL_LABELS[level]).toBe(label);
  });

  it.each(['medium', 'high', 'low'] as const)(
    'sin datos suficientes muestra «Datos insuficientes» aunque level sea %s',
    (level) => {
      expect(
        describeCredibility(credibility({ level, sufficientData: false })),
      ).toEqual({ status: 'insufficient', label: CREDIBILITY_INSUFFICIENT });
    },
  );

  it('trata como insuficiente una credibilidad sin sufficientData', () => {
    const withoutFlag = credibility();
    delete withoutFlag.sufficientData;
    expect(describeCredibility(withoutFlag)).toEqual({
      status: 'insufficient',
      label: CREDIBILITY_INSUFFICIENT,
    });
  });

  it('no usa la puntuación como veredicto en la etiqueta', () => {
    const { label } = describeCredibility(credibility({ score: 97 }));
    expect(label).not.toMatch(/\d/);
  });

  it('el aviso deja claro que es dinámica y no una garantía', () => {
    expect(CREDIBILITY_DYNAMIC_NOTICE).toBe(
      'La credibilidad cambia con nuevas evidencias y valoraciones; no es una garantía',
    );
  });
});

describe('HU-01/T7 — parseReportsResponse con credibilidad', () => {
  it('acepta items sin el campo credibility', () => {
    const body = { items: [item()], nextCursor: null };
    const outcome = parseReportsResponse(true, body);
    expect(outcome).toEqual({ result: body });
    expect(outcome.result?.items[0]).not.toHaveProperty('credibility');
  });

  it('conserva credibility null', () => {
    const body = { items: [item({ credibility: null })], nextCursor: null };
    expect(parseReportsResponse(true, body)).toEqual({ result: body });
  });

  it('conserva una credibilidad bien formada, también sin factores', () => {
    const withoutFactors = credibility({ sufficientData: false });
    delete withoutFactors.factors;
    const body = {
      items: [
        item({ credibility: credibility() }),
        item({
          id: 'bbbbbbbb-1111-2222-3333-444444444444',
          credibility: withoutFactors,
        }),
      ],
      nextCursor: null,
    };
    expect(parseReportsResponse(true, body)).toEqual({ result: body });
  });

  it.each([
    ['un valor que no es objeto', 'alta'],
    ['un nivel desconocido', { ...credibility(), level: 'very-high' }],
    ['una puntuación fuera de rango', { ...credibility(), score: 120 }],
    ['una puntuación no finita', { ...credibility(), score: Number.NaN }],
    ['una puntuación ausente', { ...credibility(), score: undefined }],
    ['updatedAt que no es cadena', { ...credibility(), updatedAt: 1 }],
    ['sufficientData no booleano', { ...credibility(), sufficientData: 'no' }],
    ['factors que no es objeto', { ...credibility(), factors: 'x' }],
    [
      'un factor no numérico',
      {
        ...credibility(),
        factors: { ...credibility().factors, validations: '3' },
      },
    ],
  ])('normaliza a null %s sin descartar la respuesta', (_case, malformed) => {
    const good = item({
      id: 'bbbbbbbb-1111-2222-3333-444444444444',
      credibility: credibility(),
    });
    const bad = {
      ...item(),
      credibility: malformed,
    } as unknown as ReportSummaryItem;

    expect(
      parseReportsResponse(true, { items: [bad, good], nextCursor: 'c1' }),
    ).toEqual({
      result: {
        items: [{ ...item(), credibility: null }, good],
        nextCursor: 'c1',
      },
    });
  });
});

describe('parseReportsResponse', () => {
  it('acepta una página con resultados', () => {
    const body = { items: [item()], nextCursor: 'c1' };
    expect(parseReportsResponse(true, body)).toEqual({ result: body });
  });

  it('acepta un vacío como resultado correcto', () => {
    expect(parseReportsResponse(true, { items: [], nextCursor: null })).toEqual(
      { result: { items: [], nextCursor: null } },
    );
  });

  it.each([
    null,
    { items: 'x', nextCursor: null },
    { items: [{ id: 1 }], nextCursor: null },
    { items: [item({ pattern_type: 3 as unknown as string })] },
  ])('trata una respuesta mal formada como error reintentable', (body) => {
    expect(parseReportsResponse(true, body)).toEqual({
      error: { code: 'QUERY_FAILED', message: INVALID_RESPONSE_MESSAGE },
    });
  });

  it('deja el mensaje de un código conocido a QUERY_ERROR_MESSAGES', () => {
    expect(
      parseReportsResponse(false, {
        error: { code: 'INVALID_TARGET_URL', message: 'técnico' },
      }),
    ).toEqual({ error: { code: 'INVALID_TARGET_URL' } });
  });

  it('conserva el mensaje de un código desconocido', () => {
    expect(
      parseReportsResponse(false, {
        error: { code: 'RATE_LIMITED', message: 'Demasiadas consultas.' },
      }),
    ).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Demasiadas consultas.' },
    });
  });

  it('no usa claves heredadas como códigos conocidos', () => {
    expect(
      parseReportsResponse(false, {
        error: { code: 'toString', message: 'x' },
      }),
    ).toEqual({ error: { code: 'toString', message: 'x' } });
  });

  it.each([null, {}, { error: 'x' }, { error: { code: 5 } }])(
    'sin código de error usa QUERY_FAILED (%j)',
    (body) => {
      expect(parseReportsResponse(false, body)).toEqual({
        error: { code: 'QUERY_FAILED' },
      });
    },
  );
});

describe('fetchReportsPage', () => {
  const query = { scope: 'page' as const, target: 'https://a.example.com/p' };

  it('hace una petición GET de solo lectura y devuelve el resultado', async () => {
    const body = { items: [item()], nextCursor: null };
    const fetchImpl = vi.fn(async () => Response.json(body));
    const signal = new AbortController().signal;

    await expect(
      fetchReportsPage(query, 'c1', { fetchImpl, signal }),
    ).resolves.toEqual({ result: body });
    expect(fetchImpl).toHaveBeenCalledWith(
      buildReportsRequestUrl(query, 'c1'),
      expect.objectContaining({ method: 'GET', signal, cache: 'no-store' }),
    );
  });

  it('interpreta un error HTTP', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'x' } },
        { status: 503 },
      ),
    );
    await expect(fetchReportsPage(query, null, { fetchImpl })).resolves.toEqual(
      { error: { code: 'SERVICE_UNAVAILABLE' } },
    );
  });

  it('trata un cuerpo no JSON como fallo reintentable', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('<html>', { status: 502 }),
    );
    await expect(fetchReportsPage(query, null, { fetchImpl })).resolves.toEqual(
      { error: { code: 'QUERY_FAILED' } },
    );
  });

  it('convierte un fallo de red en error reintentable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchReportsPage(query, null, { fetchImpl })).resolves.toEqual(
      { error: { code: 'QUERY_FAILED', message: NETWORK_ERROR_MESSAGE } },
    );
  });

  it('usa fetch global por defecto', async () => {
    const fetchSpy = vi.fn(async () =>
      Response.json({ items: [], nextCursor: null }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    await expect(fetchReportsPage(query, null)).resolves.toEqual({
      result: { items: [], nextCursor: null },
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe('mergeReportPages', () => {
  it('añade la página siguiente sin duplicar y actualiza el cursor', () => {
    const a = item({ id: 'a' });
    const b = item({ id: 'b' });
    const c = item({ id: 'c' });
    expect(
      mergeReportPages(
        { items: [a, b], nextCursor: 'c1' },
        { items: [b, c], nextCursor: null },
      ),
    ).toEqual({ items: [a, b, c], nextCursor: null });
  });
});

describe('mapeo de estados de la consulta', () => {
  const query = { scope: 'page' as const, target: 'https://a.example.com/p' };

  it('un 200 vacío es estado vacío, no error (HU01-FL-03)', () => {
    const outcome = parseReportsResponse(true, { items: [], nextCursor: null });
    const state = resolveQueryState({ ...outcome, query });
    expect(state.status).toBe('empty');
    expect(describeQueryStatus(state)).toBe(
      'No se encontraron reportes asociados a la página o dominio consultado.',
    );
  });

  it('un fallo de servicio permite reintentar', () => {
    const outcome = parseReportsResponse(false, {
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
    const state = resolveQueryState({ ...outcome, query });
    expect(state).toEqual({
      status: 'error',
      code: 'SERVICE_UNAVAILABLE',
      message: QUERY_ERROR_MESSAGES.SERVICE_UNAVAILABLE,
      canRetry: true,
    });
    expect(describeQueryStatus(state)).toBe(
      QUERY_ERROR_MESSAGES.SERVICE_UNAVAILABLE,
    );
  });

  it('un 400 de entrada inválida pide corregir, no reintentar', () => {
    const outcome = parseReportsResponse(false, {
      error: { code: 'INVALID_TARGET_URL', message: 'técnico' },
    });
    expect(resolveQueryState({ ...outcome, query })).toMatchObject({
      status: 'error',
      message: QUERY_ERROR_MESSAGES.INVALID_TARGET_URL,
      canRetry: false,
    });
  });

  it('un fallo de red se puede reintentar', async () => {
    const outcome = await fetchReportsPage(query, null, {
      fetchImpl: vi.fn(async () => {
        throw new TypeError('offline');
      }),
    });
    expect(resolveQueryState({ ...outcome, query })).toMatchObject({
      status: 'error',
      message: NETWORK_ERROR_MESSAGE,
      canRetry: true,
    });
  });

  it.each<[ResolvedQueryState, string]>([
    [{ status: 'idle' }, ''],
    [{ status: 'loading' }, 'Buscando reportes…'],
    [
      { status: 'success', items: [item()], nextCursor: null },
      '1 reporte en la lista.',
    ],
    [
      {
        status: 'success',
        items: [item({ id: 'a' }), item({ id: 'b' })],
        nextCursor: 'c',
      },
      '2 reportes en la lista. Hay más reportes disponibles.',
    ],
  ])('anuncia el estado %#', (state, text) => {
    expect(describeQueryStatus(state)).toBe(text);
  });
});
