import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../src/server/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import {
  CredibilityError,
  EVIDENCE_CAP,
  EVIDENCE_WEIGHT,
  HIGH_SCORE_THRESHOLD,
  LOW_SCORE_THRESHOLD,
  MASS_TOLERANCE,
  MAX_REPORT_IDS,
  MIN_ASSESSORS,
  MIN_MASS,
  WEIGHT_FLOOR,
  computeCredibility,
  getReportsCredibility,
  recalculateReportCredibility,
  type CredibilityInputs,
  type CredibilityResult,
  type RecalculateContext,
} from '../src/server/credibility';
import { createServerSupabaseClient } from '../src/server/supabase';
import {
  createFakeSupabase,
  type FakeSupabaseConfig,
} from './support/fake-supabase';

const REPORT = '09c00000-0000-4000-8000-000000000001';
const OTHER_REPORT = '09c00000-0000-4000-8000-000000000002';
const REPORT_CREATED_AT = '2026-11-01T08:00:00+00:00';
const EVIDENCE_AT = '2026-11-02T10:00:00+00:00';
const ASSESSMENT_AT = '2026-11-03T10:00:00.123456+00:00';

interface Scenario {
  evidences?: number;
  validate?: number[];
  invalidate?: number[];
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Fila tal y como la devuelve `public.report_credibility_inputs`. */
function row(scenario: Scenario = {}, reportId = REPORT) {
  const evidences = scenario.evidences ?? 0;
  const validate = scenario.validate ?? [];
  const invalidate = scenario.invalidate ?? [];
  const assessed = validate.length + invalidate.length > 0;
  return {
    report_id: reportId,
    report_created_at: REPORT_CREATED_AT,
    visible_evidences: evidences,
    latest_evidence_at: evidences > 0 ? EVIDENCE_AT : null,
    validations: validate.length,
    validation_trust_sum: sum(validate),
    invalidations: invalidate.length,
    invalidation_trust_sum: sum(invalidate),
    latest_assessment_at: assessed ? ASSESSMENT_AT : null,
  };
}

/** Mismas entradas en el formato de `computeCredibility`. */
function inputs(scenario: Scenario = {}): CredibilityInputs {
  const r = row(scenario);
  return {
    reportCreatedAt: r.report_created_at,
    visibleEvidences: r.visible_evidences,
    latestEvidenceAt: r.latest_evidence_at,
    validations: r.validations,
    validationTrustSum: r.validation_trust_sum,
    invalidations: r.invalidations,
    invalidationTrustSum: r.invalidation_trust_sum,
    latestAssessmentAt: r.latest_assessment_at,
  };
}

function fake(config: FakeSupabaseConfig) {
  return createFakeSupabase(config);
}

async function recalc(
  rpcData: unknown,
  context?: RecalculateContext,
  logError = vi.fn(),
) {
  const { client, calls } = fake({ rpcData });
  const result = await recalculateReportCredibility(REPORT, context, {
    client,
    logError,
  });
  return { result, calls, logError };
}

async function expectCredibilityError(
  promise: Promise<unknown>,
  code: CredibilityError['code'],
) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(CredibilityError);
  expect((error as CredibilityError).code).toBe(code);
  return error as CredibilityError;
}

function expectInvalid(value: CredibilityInputs) {
  let error: unknown = null;
  try {
    computeCredibility(value);
  } catch (reason) {
    error = reason;
  }
  expect(error).toBeInstanceOf(CredibilityError);
  expect((error as CredibilityError).code).toBe('INVALID_AGGREGATES');
}

beforeEach(() => {
  vi.mocked(createServerSupabaseClient).mockReset();
});

describe('constantes del diseño', () => {
  it('coinciden con docs/domain-design.md', () => {
    expect({
      WEIGHT_FLOOR,
      EVIDENCE_WEIGHT,
      EVIDENCE_CAP,
      HIGH_SCORE_THRESHOLD,
      LOW_SCORE_THRESHOLD,
      MIN_ASSESSORS,
      MIN_MASS,
      MASS_TOLERANCE,
      MAX_REPORT_IDS,
    }).toEqual({
      WEIGHT_FLOOR: 0.25,
      EVIDENCE_WEIGHT: 0.25,
      EVIDENCE_CAP: 1,
      HIGH_SCORE_THRESHOLD: 70,
      LOW_SCORE_THRESHOLD: 40,
      MIN_ASSESSORS: 2,
      MIN_MASS: 1,
      MASS_TOLERANCE: 1e-9,
      MAX_REPORT_IDS: 100,
    });
  });
});

// Batería TDD de docs/domain-design.md («Casos de ejemplo»). Las reglas que
// aplica la base de datos (evidencias ocultas, autor, última valoración,
// perfil inactivo y confianza actual) llegan ya aplicadas en los agregados de
// la RPC; report_credibility_inputs.test.sql las prueba en PostgreSQL.
describe('casos de ejemplo', () => {
  // prettier-ignore
  const cases: {
    n: number;
    name: string;
    scenario: Scenario;
    P: number;
    N: number;
    A: number;
    score: number;
    sufficientData: boolean;
    level: CredibilityResult['level'];
  }[] = [
    { n: 1, name: 'sin evidencias ni valoraciones', scenario: {}, P: 0, N: 0, A: 0, score: 50, sufficientData: false, level: 'medium' },
    { n: 2, name: '2 evidencias visibles', scenario: { evidences: 2 }, P: 0.5, N: 0, A: 0, score: 60, sufficientData: false, level: 'medium' },
    { n: 3, name: '4 evidencias visibles', scenario: { evidences: 4 }, P: 1, N: 0, A: 0, score: 67, sufficientData: false, level: 'medium' },
    { n: 4, name: '10 evidencias visibles: tope', scenario: { evidences: 10 }, P: 1, N: 0, A: 0, score: 67, sufficientData: false, level: 'medium' },
    { n: 5, name: '4 evidencias, 2 ocultas (la RPC cuenta 2)', scenario: { evidences: 2 }, P: 0.5, N: 0, A: 0, score: 60, sufficientData: false, level: 'medium' },
    { n: 6, name: '1 validación t=100', scenario: { validate: [100] }, P: 1, N: 0, A: 1, score: 67, sufficientData: false, level: 'medium' },
    { n: 7, name: '1 invalidación t=100', scenario: { invalidate: [100] }, P: 0, N: 1, A: 1, score: 33, sufficientData: false, level: 'medium' },
    { n: 8, name: '1 validación t=100 + 4 evidencias: un valorador no basta', scenario: { validate: [100], evidences: 4 }, P: 2, N: 0, A: 1, score: 75, sufficientData: false, level: 'medium' },
    { n: 9, name: '2 validaciones t=100', scenario: { validate: [100, 100] }, P: 2, N: 0, A: 2, score: 75, sufficientData: true, level: 'high' },
    { n: 10, name: '2 invalidaciones t=100', scenario: { invalidate: [100, 100] }, P: 0, N: 2, A: 2, score: 25, sufficientData: true, level: 'low' },
    { n: 11, name: '2 validaciones t=1: masa insuficiente', scenario: { validate: [1, 1] }, P: 0.5, N: 0, A: 2, score: 60, sufficientData: false, level: 'medium' },
    { n: 12, name: '4 validaciones t=1', scenario: { validate: [1, 1, 1, 1] }, P: 1, N: 0, A: 4, score: 67, sufficientData: true, level: 'medium' },
    { n: 13, name: '8 validaciones t=1', scenario: { validate: Array<number>(8).fill(1) }, P: 2, N: 0, A: 8, score: 75, sufficientData: true, level: 'high' },
    { n: 14, name: '2 validaciones t=1 + 2 evidencias', scenario: { validate: [1, 1], evidences: 2 }, P: 1, N: 0, A: 2, score: 67, sufficientData: true, level: 'medium' },
    { n: 15, name: '1 validación t=100 + 1 invalidación t=1', scenario: { validate: [100], invalidate: [1] }, P: 1, N: 0.25, A: 2, score: 62, sufficientData: true, level: 'medium' },
    { n: 16, name: '2 validaciones t=100 + 2 invalidaciones t=100', scenario: { validate: [100, 100], invalidate: [100, 100] }, P: 2, N: 2, A: 4, score: 50, sufficientData: true, level: 'medium' },
    { n: 17, name: '3 validaciones t=100 + 4 evidencias', scenario: { validate: [100, 100, 100], evidences: 4 }, P: 4, N: 0, A: 3, score: 83, sufficientData: true, level: 'high' },
    { n: 18, name: '2 validaciones t=34 + 1 invalidación t=67', scenario: { validate: [34, 34], invalidate: [67] }, P: 1, N: 0.75, A: 3, score: 53, sufficientData: true, level: 'medium' },
    { n: 19, name: '1 validación t=34 + 3 invalidaciones t=67', scenario: { validate: [34], invalidate: [67, 67, 67] }, P: 0.5, N: 2.25, A: 4, score: 32, sufficientData: true, level: 'low' },
    { n: 20, name: 'el autor valida (ignorado) + 1 validación ajena t=100', scenario: { validate: [100] }, P: 1, N: 0, A: 1, score: 67, sufficientData: false, level: 'medium' },
    { n: 21, name: 'X valida y después invalida + Y invalida (t=100)', scenario: { invalidate: [100, 100] }, P: 0, N: 2, A: 2, score: 25, sufficientData: true, level: 'low' },
    { n: 22, name: '2 validaciones t=100, una de un perfil inactivo', scenario: { validate: [100] }, P: 1, N: 0, A: 1, score: 67, sufficientData: false, level: 'medium' },
    { n: 23, name: 'caso 11 tras subir la confianza de ambos a 100', scenario: { validate: [100, 100] }, P: 2, N: 0, A: 2, score: 75, sufficientData: true, level: 'high' },
  ];

  it('la tabla tiene los 23 casos del diseño', () => {
    expect(cases.map((c) => c.n)).toEqual(
      Array.from({ length: 23 }, (_, i) => i + 1),
    );
  });

  for (const c of cases) {
    it(`caso ${String(c.n).padStart(2, '0')}: ${c.name}`, async () => {
      const { result } = await recalc([row(c.scenario)]);
      expect(result).toMatchObject({
        score: c.score,
        level: c.level,
        sufficientData: c.sufficientData,
      });
      expect(result.factors).toMatchObject({
        assessors: c.A,
        supportWeight: c.P,
        againstWeight: c.N,
      });
      expect(computeCredibility(inputs(c.scenario))).toEqual(result);
    });
  }
});

describe('propiedades', () => {
  const causes: (RecalculateContext | undefined)[] = [
    undefined,
    { cause: 'evidence_added', triggerId: 'e1' },
    { cause: 'evidence_moderated' },
    { cause: 'validation_added', triggerId: 'a1' },
    { cause: 'manual_recalc' },
  ];

  it('idempotencia: el mismo estado da el mismo resultado con cualquier context', async () => {
    const data = [row({ validate: [100, 34], invalidate: [67], evidences: 3 })];
    const { client, calls } = fake({ rpcData: data });
    const logError = vi.fn();
    const results: CredibilityResult[] = [];
    for (const context of causes) {
      for (let i = 0; i < 3; i++) {
        results.push(
          await recalculateReportCredibility(REPORT, context, {
            client,
            logError,
          }),
        );
      }
    }
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
    // Recalcula siempre desde el estado completo: sin caché ni incrementos.
    expect(calls.rpc).toHaveLength(causes.length * 3);
    expect(logError).not.toHaveBeenCalled();
  });

  // Rejilla de estados para las propiedades de monotonía y límites.
  const trusts = [1, 34, 67, 100];
  const groups: number[][] = [
    [],
    [1],
    [100],
    [34, 67],
    [1, 1, 100],
    [100, 100, 100],
  ];
  const grid: Scenario[] = [];
  for (const evidences of [0, 1, 3, 4, 7]) {
    for (const validate of groups) {
      for (const invalidate of groups) {
        grid.push({ evidences, validate, invalidate });
      }
    }
  }
  const score = (s: Scenario) => computeCredibility(inputs(s)).score;

  it('monotonía: añadir una validación o evidencia no baja la puntuación', () => {
    for (const s of grid) {
      const base = score(s);
      expect(
        score({ ...s, evidences: (s.evidences ?? 0) + 1 }),
      ).toBeGreaterThanOrEqual(base);
      for (const t of trusts) {
        expect(
          score({ ...s, validate: [...(s.validate ?? []), t] }),
        ).toBeGreaterThanOrEqual(base);
      }
    }
  });

  it('monotonía: añadir una invalidación no sube la puntuación', () => {
    for (const s of grid) {
      const base = score(s);
      for (const t of trusts) {
        expect(
          score({ ...s, invalidate: [...(s.invalidate ?? []), t] }),
        ).toBeLessThanOrEqual(base);
      }
    }
  });

  it('límites: la puntuación es siempre un entero entre 0 y 100', () => {
    const allAgainst: Scenario = { invalidate: Array<number>(500).fill(100) };
    const allFor: Scenario = {
      validate: Array<number>(500).fill(100),
      evidences: 1000,
    };
    for (const s of [...grid, allAgainst, allFor]) {
      const value = score(s);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(score(allAgainst)).toBeLessThan(LOW_SCORE_THRESHOLD);
    expect(score(allFor)).toBeGreaterThanOrEqual(HIGH_SCORE_THRESHOLD);
  });

  it('límites: solo evidencias nunca dan high ni datos suficientes', () => {
    for (let evidences = 0; evidences <= 50; evidences++) {
      const result = computeCredibility(inputs({ evidences }));
      expect(result.level).toBe('medium');
      expect(result.sufficientData).toBe(false);
    }
  });

  it('límites: un único valorador nunca da high ni low', () => {
    for (const evidences of [0, 2, 4, 10]) {
      for (const t of [1, 50, 100]) {
        for (const scenario of [
          { evidences, validate: [t] },
          { evidences, invalidate: [t] },
        ]) {
          const result = computeCredibility(inputs(scenario));
          expect(result.level).toBe('medium');
          expect(result.sufficientData).toBe(false);
        }
      }
    }
  });

  it('factors en el caso 4: visibleEvidences antes del tope', async () => {
    const { result } = await recalc([row({ evidences: 10 })]);
    expect(result.factors).toEqual({
      visibleEvidences: 10,
      validations: 0,
      invalidations: 0,
      assessors: 0,
      supportWeight: 1,
      againstWeight: 0,
    });
  });

  it('factors en el caso 21: solo cuenta la última valoración de X', async () => {
    const { result } = await recalc([row({ invalidate: [100, 100] })]);
    expect(result.factors).toEqual({
      visibleEvidences: 0,
      validations: 0,
      invalidations: 2,
      assessors: 2,
      supportWeight: 0,
      againstWeight: 2,
    });
  });

  it('factors redondea las masas a 2 decimales', () => {
    // 1 validación t=2: 0.25 + 0.75/99 = 0.2575…
    const result = computeCredibility(inputs({ validate: [2] }));
    expect(result.factors?.supportWeight).toBe(0.26);
  });

  it('updatedAt en el caso 1: la fecha de creación del reporte', async () => {
    const { result } = await recalc([row()]);
    expect(result.updatedAt).toBe('2026-11-01T08:00:00.000Z');
  });

  it('updatedAt en el caso 20: la valoración del autor no la mueve', async () => {
    // La RPC excluye la valoración del autor (más reciente) también de
    // latest_assessment_at; el resultado usa la de la valoración contada.
    const { result } = await recalc([
      {
        ...row({ validate: [100] }),
        latest_assessment_at: '2026-11-05T10:00:00+00:00',
      },
    ]);
    expect(result.updatedAt).toBe('2026-11-05T10:00:00.000Z');
  });

  it('updatedAt es la fecha más reciente entre evidencias y valoraciones', () => {
    const both = inputs({ evidences: 1, validate: [1] });
    expect(computeCredibility(both).updatedAt).toBe('2026-11-03T10:00:00.123Z');
    expect(
      computeCredibility({
        ...both,
        latestEvidenceAt: '2026-11-04T00:00:00Z',
      }).updatedAt,
    ).toBe('2026-11-04T00:00:00.000Z');
  });

  it('la masa mínima usa la tolerancia de coma flotante', () => {
    // 4 validaciones t=1 suman exactamente 1.0 (límite incluido); 3 suman 0.75.
    expect(
      computeCredibility(inputs({ validate: [1, 1, 1, 1] })).sufficientData,
    ).toBe(true);
    expect(
      computeCredibility(inputs({ validate: [1, 1, 1] })).sufficientData,
    ).toBe(false);
  });
});

describe('defensa ante agregados incoherentes', () => {
  const valid = inputs({ evidences: 1, validate: [50], invalidate: [20] });

  it.each([
    ['recuento de evidencias negativo', { visibleEvidences: -1 }],
    [
      'recuento de validaciones negativo',
      { validations: -1, validationTrustSum: 0 },
    ],
    [
      'recuento de invalidaciones negativo',
      { invalidations: -1, invalidationTrustSum: 0 },
    ],
    ['recuento no entero', { visibleEvidences: 1.5 }],
    ['recuento no finito', { validations: Number.NaN }],
    ['suma de confianza menor que n', { validationTrustSum: 0 }],
    ['suma de confianza mayor que 100·n', { invalidationTrustSum: 101 }],
    [
      'suma de confianza sin valoraciones',
      { validations: 0, validationTrustSum: 5 },
    ],
    ['suma de confianza no entera', { validationTrustSum: 50.5 }],
    ['evidencias sin fecha', { latestEvidenceAt: null }],
    ['fecha de evidencia sin evidencias', { visibleEvidences: 0 }],
    ['valoraciones sin fecha', { latestAssessmentAt: null }],
    [
      'fecha de valoración sin valoraciones',
      {
        validations: 0,
        validationTrustSum: 0,
        invalidations: 0,
        invalidationTrustSum: 0,
      },
    ],
    ['fecha de creación inválida', { reportCreatedAt: 'ayer' }],
    ['fecha de evidencia inválida', { latestEvidenceAt: 'no-es-fecha' }],
    ['fecha de valoración inválida', { latestAssessmentAt: '' }],
  ] as [string, Partial<CredibilityInputs>][])(
    'rechaza %s',
    (_name, override) => {
      expectInvalid({ ...valid, ...override });
    },
  );

  it('acepta los extremos válidos de la suma de confianza', () => {
    expect(() =>
      computeCredibility({
        ...valid,
        validations: 2,
        validationTrustSum: 2,
        invalidations: 2,
        invalidationTrustSum: 200,
      }),
    ).not.toThrow();
  });

  it.each([
    ['una fila que no es un objeto', [42]],
    ['una fila nula', [null]],
    ['un report_id que no es texto', [{ ...row(), report_id: 7 }]],
    [
      'un recuento como texto',
      [{ ...row({ evidences: 1 }), visible_evidences: '1' }],
    ],
    ['una fecha que no es texto', [{ ...row(), report_created_at: 1 }]],
    ['una fecha nula de creación', [{ ...row(), report_created_at: null }]],
    [
      'una suma incoherente',
      [{ ...row({ validate: [1] }), validation_trust_sum: 0 }],
    ],
    ['un reporte no solicitado', [row({}, OTHER_REPORT)]],
    ['un reporte repetido', [row(), row()]],
    ['datos que no son una lista', { report_id: REPORT }],
    ['datos nulos', null],
  ])('rechaza una respuesta de la RPC con %s', async (_name, data) => {
    const logError = vi.fn();
    const { client } = fake({ rpcData: data });
    await expectCredibilityError(
      recalculateReportCredibility(REPORT, undefined, { client, logError }),
      'INVALID_AGGREGATES',
    );
    expect(logError).toHaveBeenCalledOnce();
  });
});

describe('recalculateReportCredibility', () => {
  it('pide los agregados por RPC y no escribe nada', async () => {
    const { calls } = await recalc([row({ validate: [100] })]);
    expect(calls.rpc).toEqual([
      { name: 'report_credibility_inputs', args: { report_ids: [REPORT] } },
    ]);
    expect(calls.inserted).toEqual([]);
    expect(calls.filters).toEqual([]);
    expect(calls.uploads).toEqual([]);
    expect(calls.removed).toEqual([]);
  });

  it('normaliza el identificador a minúsculas', async () => {
    const { client, calls } = fake({ rpcData: [row()] });
    const result = await recalculateReportCredibility(
      REPORT.toUpperCase(),
      undefined,
      { client },
    );
    expect(result.score).toBe(50);
    expect(calls.rpc[0]?.args).toEqual({ report_ids: [REPORT] });
  });

  it.each([['no-uuid'], [''], [42], [null]])(
    'rechaza el identificador %j sin llamar a la RPC',
    async (reportId) => {
      const { client, calls } = fake({ rpcData: [] });
      const logError = vi.fn();
      await expectCredibilityError(
        recalculateReportCredibility(reportId as string, undefined, {
          client,
          logError,
        }),
        'INVALID_INPUT',
      );
      expect(calls.rpc).toEqual([]);
      expect(logError).toHaveBeenCalledOnce();
    },
  );

  it('un reporte inexistente o no visible es NOT_FOUND', async () => {
    const { client } = fake({ rpcData: [] });
    await expectCredibilityError(
      recalculateReportCredibility(REPORT, undefined, {
        client,
        logError: vi.fn(),
      }),
      'NOT_FOUND',
    );
  });

  it('un error de la RPC es UNAVAILABLE, registra la causa y no inventa credibilidad', async () => {
    const { client } = fake({
      rpcError: { message: 'permission denied', code: '42501' },
    });
    const logError = vi.fn();
    const error = await expectCredibilityError(
      recalculateReportCredibility(
        REPORT,
        { cause: 'evidence_added', triggerId: 'e-1' },
        { client, logError },
      ),
      'UNAVAILABLE',
    );
    expect(error.message).not.toContain('permission denied');
    expect(logError).toHaveBeenCalledOnce();
    const [message, cause] = logError.mock.calls[0] ?? [];
    expect(message).toContain(REPORT);
    expect(message).toContain('evidence_added');
    expect(message).toContain('e-1');
    expect(cause).toBe(error);
    expect(error.cause).toEqual({
      message: 'permission denied',
      code: '42501',
    });
  });

  it('una excepción del cliente es UNAVAILABLE', async () => {
    const failure = new Error('red caída');
    const { client } = fake({ rpcThrows: failure });
    const logError = vi.fn();
    const error = await expectCredibilityError(
      recalculateReportCredibility(
        REPORT,
        { cause: 'manual_recalc' },
        {
          client,
          logError,
        },
      ),
      'UNAVAILABLE',
    );
    expect(error.cause).toBe(failure);
    expect(logError.mock.calls[0]?.[0]).toContain('manual_recalc');
  });

  it('sin context, el registro indica que no hay causa', async () => {
    const { client } = fake({ rpcError: { message: 'fallo' } });
    const logError = vi.fn();
    await expectCredibilityError(
      recalculateReportCredibility(REPORT, undefined, { client, logError }),
      'UNAVAILABLE',
    );
    expect(logError.mock.calls[0]?.[0]).toContain('sin causa');
  });

  it('por defecto usa el cliente de servidor sin sesión', async () => {
    const { client, calls } = fake({ rpcData: [row({ evidences: 2 })] });
    vi.mocked(createServerSupabaseClient).mockReturnValue(client);
    const result = await recalculateReportCredibility(REPORT);
    expect(createServerSupabaseClient).toHaveBeenCalledExactlyOnceWith();
    expect(result.score).toBe(60);
    expect(calls.rpc).toHaveLength(1);
  });

  it('una configuración de Supabase inválida es UNAVAILABLE', async () => {
    vi.mocked(createServerSupabaseClient).mockImplementation(() => {
      throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL');
    });
    await expectCredibilityError(
      recalculateReportCredibility(REPORT, undefined, { logError: vi.fn() }),
      'UNAVAILABLE',
    );
  });

  it('por defecto registra los fallos con console.error', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { client } = fake({ rpcError: { message: 'fallo' } });
    await expectCredibilityError(
      recalculateReportCredibility(REPORT, undefined, { client }),
      'UNAVAILABLE',
    );
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('el patrón de invocación tras guardar no cambia la respuesta', async () => {
    // Así deben llamarlo HU-06/T5 y HU-08/T4 (docs/api/evidences.md).
    const { client } = fake({ rpcError: { message: 'fallo' } });
    const logError = vi.fn();
    const respond = async () => {
      try {
        await recalculateReportCredibility(
          REPORT,
          { cause: 'validation_added', triggerId: 'a-1' },
          { client, logError },
        );
      } catch {
        // Ya registrado; la operación principal sigue siendo un éxito.
      }
      return 201;
    };
    expect(await respond()).toBe(201);
    expect(logError).toHaveBeenCalledOnce();
  });
});

describe('getReportsCredibility', () => {
  it('calcula un lote con una sola RPC', async () => {
    const { client, calls } = fake({
      rpcData: [
        row({ validate: [100, 100] }),
        row({ evidences: 2 }, OTHER_REPORT),
      ],
    });
    const result = await getReportsCredibility([REPORT, OTHER_REPORT], {
      client,
    });
    expect(calls.rpc).toEqual([
      {
        name: 'report_credibility_inputs',
        args: { report_ids: [REPORT, OTHER_REPORT] },
      },
    ]);
    expect(result).toBeInstanceOf(Map);
    expect(result.get(REPORT)).toMatchObject({ score: 75, level: 'high' });
    expect(result.get(OTHER_REPORT)).toMatchObject({
      score: 60,
      level: 'medium',
    });
  });

  it('omite los reportes inexistentes o no visibles', async () => {
    const { client } = fake({ rpcData: [row()] });
    const result = await getReportsCredibility([REPORT, OTHER_REPORT], {
      client,
    });
    expect([...result.keys()]).toEqual([REPORT]);
  });

  it('elimina duplicados y normaliza a minúsculas', async () => {
    const { client, calls } = fake({ rpcData: [row()] });
    const result = await getReportsCredibility(
      [REPORT, REPORT.toUpperCase(), REPORT],
      { client },
    );
    expect(calls.rpc[0]?.args).toEqual({ report_ids: [REPORT] });
    expect(result.size).toBe(1);
  });

  it('una lista vacía no llama a la RPC', async () => {
    const { client, calls } = fake({ rpcData: [] });
    expect((await getReportsCredibility([], { client })).size).toBe(0);
    expect(calls.rpc).toEqual([]);
  });

  it(`acepta ${MAX_REPORT_IDS} identificadores y rechaza más`, async () => {
    const ids = (count: number) =>
      Array.from(
        { length: count },
        (_, i) => `09c00000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      );
    const { client, calls } = fake({ rpcData: [] });
    await expect(
      getReportsCredibility(ids(MAX_REPORT_IDS), { client }),
    ).resolves.toEqual(new Map());
    await expectCredibilityError(
      getReportsCredibility(ids(MAX_REPORT_IDS + 1), { client }),
      'INVALID_INPUT',
    );
    expect(calls.rpc).toHaveLength(1);
  });

  it.each([
    ['una lista con un identificador inválido', [REPORT, 'x']],
    ['algo que no es una lista', REPORT],
  ])('rechaza %s', async (_name, ids) => {
    const { client, calls } = fake({ rpcData: [] });
    await expectCredibilityError(
      getReportsCredibility(ids as string[], { client }),
      'INVALID_INPUT',
    );
    expect(calls.rpc).toEqual([]);
  });

  it('un error de la RPC es UNAVAILABLE', async () => {
    const { client } = fake({ rpcError: { message: 'fallo' } });
    await expectCredibilityError(
      getReportsCredibility([REPORT], { client }),
      'UNAVAILABLE',
    );
  });

  it('una excepción del cliente o de la configuración es UNAVAILABLE', async () => {
    vi.mocked(createServerSupabaseClient).mockImplementation(() => {
      throw new Error('sin configuración');
    });
    await expectCredibilityError(
      getReportsCredibility([REPORT]),
      'UNAVAILABLE',
    );
  });
});
