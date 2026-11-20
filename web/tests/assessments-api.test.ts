import { beforeEach, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { POST } from '../src/app/api/reports/[reportId]/assessments/route';
import * as credibility from '../src/server/credibility';

vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
const actor = '08000000-0000-4000-8000-000000000001';
const report = '08000000-0000-4000-8000-000000000002';
const revision = '08000000-0000-4000-8000-000000000003';
const id = '08000000-0000-4000-8000-000000000004';
const getUser = vi.fn();
const rpc = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn();
const from = vi.fn();
const result = (action = 'validate') => ({
  id,
  reportId: report,
  action,
  createdAt: '2026-11-20T12:00:00.000001+00:00',
});
const request = (
  body = '{"action":"validate"}',
  header: string | null = 'Bearer token',
) =>
  new Request('http://localhost/api/reports/' + report + '/assessments', {
    method: 'POST',
    headers: header ? { authorization: header } : {},
    body,
  });
const run = async (
  body?: string,
  reportId = report,
  header: string | null = 'Bearer token',
) => {
  const calculations = vi.mocked(credibility.recalculateReportCredibility).mock
    .calls.length;
  const response = await POST(request(body, header), {
    params: Promise.resolve({ reportId }),
  });
  // Applies to every existing rejection, including mixed success/failure scenarios.
  if (response.status !== 201) {
    expect(credibility.recalculateReportCredibility).toHaveBeenCalledTimes(
      calculations,
    );
  }
  return response;
};
const aggregate = (action = 'validate', reportId = report) => ({
  report_id: reportId,
  report_created_at: '2026-11-19T12:00:00Z',
  visible_evidences: 0,
  latest_evidence_at: null,
  validations: action === 'validate' ? 1 : 0,
  validation_trust_sum: action === 'validate' ? 30 : 0,
  invalidations: action === 'invalidate' ? 1 : 0,
  invalidation_trust_sum: action === 'invalidate' ? 30 : 0,
  latest_assessment_at: result().createdAt,
});
let submitResult: {
  data: unknown;
  error?: { code: string; message?: string };
  status?: number;
};
let policyResult: { data: unknown; error?: object; status?: number };
beforeEach(() => {
  vi.resetAllMocks();
  // Observe the real HU-09 service: only SDK I/O is replaced.
  vi.spyOn(credibility, 'recalculateReportCredibility');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.com');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubEnv('ASSESSMENTS_MIN_TRUST_LEVEL', '20');
  getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null });
  maybeSingle.mockResolvedValue({
    data: {
      id: actor,
      is_active: true,
      trust_level: 30,
      role_code: 'developer',
    },
    error: null,
  });
  const query = { select: vi.fn(), eq, maybeSingle };
  query.select.mockReturnValue(query);
  eq.mockReturnValue(query);
  from.mockReturnValue(query);
  policyResult = { data: { minimumTrustLevel: 20, revision } };
  submitResult = { data: result() };
  rpc.mockImplementation(
    async (
      name: string,
      args?: { requested_action: string; report_ids: string[] },
    ) => {
      if (name === 'my_permissions')
        return {
          data: { roleCode: 'developer', permissions: ['assessments.submit'] },
        };
      if (name === 'assessment_policy') return policyResult;
      if (name === 'report_credibility_inputs')
        return { data: [aggregate('validate', args?.report_ids[0])] };
      if (name === 'submit_report_assessment') {
        if (submitResult.data && !submitResult.error)
          return {
            ...submitResult,
            data: { ...submitResult.data, action: args?.requested_action },
          };
        return submitResult;
      }
      throw new Error('Unexpected RPC');
    },
  );
  vi.mocked(createClient).mockReturnValue({
    auth: { getUser },
    from,
    rpc,
  } as unknown as ReturnType<typeof createClient>);
});

it.each(['validate', 'invalidate'])(
  'persists %s through the scoped RPC and returns its receipt',
  async (action) => {
    const response = await run(JSON.stringify({ action }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(result(action));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(getUser).toHaveBeenCalledWith('token');
    expect(eq).toHaveBeenCalledWith('id', actor);
    expect(rpc).toHaveBeenNthCalledWith(3, 'submit_report_assessment', {
      target_report_id: report,
      requested_action: action,
      expected_policy_revision: revision,
    });
    expect(
      credibility.recalculateReportCredibility,
    ).toHaveBeenCalledExactlyOnceWith(
      report,
      { cause: 'validation_added', triggerId: id },
      { client: vi.mocked(createClient).mock.results.at(-1)?.value },
    );
    expect(rpc).toHaveBeenLastCalledWith('report_credibility_inputs', {
      report_ids: [report],
    });
    expect(console.error).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledExactlyOnceWith('profiles');
    expect(createClient).toHaveBeenLastCalledWith(
      'https://project.example.com',
      'sb_publishable_test',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer token' } },
      }),
    );
  },
);
it.each([null, '', 'Basic token', 'Bearer bad token'])(
  'rejects absent or malformed session %s',
  async (header) => {
    expect((await run(undefined, report, header)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  },
);
it('rejects expired tokens', async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
  expect((await run()).status).toBe(401);
});
it.each([
  null,
  { id: actor, is_active: false, trust_level: 30 },
  { id: actor, is_active: true, trust_level: 19 },
])('rejects unavailable, inactive or low-trust actors %#', async (data) => {
  maybeSingle.mockResolvedValue({ data });
  expect((await run()).status).toBe(403);
  expect(rpc).not.toHaveBeenCalledWith('assessment_policy');
});
it('rejects a missing effective permission', async () => {
  rpc.mockResolvedValue({ data: { roleCode: 'admin', permissions: [] } });
  expect((await run()).status).toBe(403);
});
it.each([undefined, '0', '1.5'])(
  'fails closed without a valid T2 policy %s',
  async (minimum) => {
    vi.stubEnv('ASSESSMENTS_MIN_TRUST_LEVEL', minimum);
    expect((await run()).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  },
);
it('fails closed on T2 service failure', async () => {
  getUser.mockRejectedValue(new Error('private detail'));
  expect((await run()).status).toBe(503);
});
it.each([
  '',
  'bad',
  report + '\n',
  '{' + report + '}',
  report.replaceAll('-', ''),
])('rejects malformed UUID %s', async (value) => {
  expect((await run(undefined, value)).status).toBe(400);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it('normalizes UUID case', async () => {
  const upper = 'ABCDEF00-0000-4000-8000-000000000002';
  submitResult = { data: { ...result(), reportId: upper.toLowerCase() } };
  expect((await run(undefined, upper)).status).toBe(201);
});
it.each([
  '{',
  '',
  'null',
  '[]',
  '1',
  'true',
  '"validate"',
  '{}',
  '{"action":null}',
  '{"action":"VALIDATE"}',
  '{"action":"validate "}',
  '{"action":"withdraw"}',
  '{"action":true}',
  '{"action":"validate","assessor_id":"spoof"}',
  '{"action":"validate","minimumTrustLevel":1}',
  '{"action":"validate","created_at":"2000-01-01"}',
  '{"action":"validate","permissions":[]}',
])('rejects invalid body %s', async (body) => {
  expect((await run(body)).status).toBe(400);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it.each([
  null,
  {},
  { minimumTrustLevel: null, revision },
  { minimumTrustLevel: 1, revision },
  { minimumTrustLevel: '20', revision },
  { minimumTrustLevel: 20, revision: 'bad' },
])('rejects missing or mismatched protected policy %#', async (data) => {
  policyResult = { data };
  const response = await run();
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe('POLICY_UNAVAILABLE');
  expect(rpc).toHaveBeenCalledTimes(2);
});
it('rejects policy query errors', async () => {
  policyResult.error = { message: 'secret' };
  expect((await run()).status).toBe(503);
});
it.each([
  ['42501', 403],
  ['PT403', 403],
  ['PT404', 404],
  ['PT409', 409],
  ['40001', 409],
  ['40P01', 409],
  ['22023', 400],
  ['22P02', 400],
  ['PT503', 503],
  ['23503', 503],
  ['unknown', 503],
] as const)(
  'maps SQL error %s to %i without returning success',
  async (code, status) => {
    submitResult = {
      data: result(),
      error: { code, message: 'private database detail' },
    };
    const response = await run();
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain('private database detail');
  },
);
it('handles token expiration at the write boundary', async () => {
  submitResult = { data: null, error: { code: 'PGRST301' }, status: 401 };
  expect((await run()).status).toBe(401);
});
it('does not trust a preflight success after authorization has been revoked', async () => {
  expect((await run()).status).toBe(201);
  submitResult = { data: null, error: { code: '42501' } };
  expect((await run()).status).toBe(403);
  expect(getUser).toHaveBeenCalledTimes(2);
});
it('sends repeated and concurrent requests as separate history entries, without a cache', async () => {
  const responses = await Promise.all([
    run(),
    run('{"action":"invalidate"}'),
    run(),
  ]);
  expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
  expect(
    rpc.mock.calls.filter(([name]) => name === 'submit_report_assessment'),
  ).toHaveLength(3);
  // Actual serialization/latest-wins is tested in PostgreSQL, not asserted by this fake.
});
it.each([
  null,
  {},
  { ...result(), id: 'bad' },
  { ...result(), reportId: actor },
  { ...result(), createdAt: 'bad' },
  { ...result(), createdAt: null },
])('does not fabricate a receipt from malformed RPC data %#', async (data) => {
  submitResult = { data };
  expect((await run()).status).toBe(503);
});
it('rejects a receipt for a different action and strips unexpected fields on success', async () => {
  rpc
    .mockImplementationOnce(async () => ({
      data: { permissions: ['assessments.submit'] },
    }))
    .mockImplementationOnce(async () => policyResult)
    .mockImplementationOnce(async () => ({
      data: { ...result(), action: 'invalidate' },
    }));
  expect((await run()).status).toBe(503);
  submitResult = { data: { ...result(), assessor_id: actor, extra: 'secret' } };
  expect(await (await run()).json()).toEqual(result());
});
it('does not signal success when transport fails after submission', async () => {
  rpc
    .mockImplementationOnce(async () => ({
      data: { permissions: ['assessments.submit'] },
    }))
    .mockImplementationOnce(async () => policyResult)
    .mockRejectedValueOnce(new Error('timeout'));
  expect((await run()).status).toBe(503);
});
it('awaits the write confirmation before returning', async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise((r) => {
    resolve = r;
  });
  rpc
    .mockImplementationOnce(async () => ({
      data: { permissions: ['assessments.submit'] },
    }))
    .mockImplementationOnce(async () => policyResult)
    .mockImplementationOnce(() => pending);
  let finished = false;
  const operation = run().then((response) => {
    finished = true;
    return response;
  });
  await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
  expect(finished).toBe(false);
  expect(credibility.recalculateReportCredibility).not.toHaveBeenCalled();
  resolve({ data: result() });
  expect((await operation).status).toBe(201);
  expect(credibility.recalculateReportCredibility).toHaveBeenCalledOnce();
});

it.each(['validate', 'invalidate'])(
  'uses the real HU-09 calculation after %s without adding a score to the receipt',
  async (action) => {
    const sdk = rpc.getMockImplementation()!;
    rpc.mockImplementation((name, args) =>
      name === 'report_credibility_inputs'
        ? Promise.resolve({ data: [aggregate(action)] })
        : sdk(name, args),
    );
    const response = await run(JSON.stringify({ action }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(result(action));
    await expect(
      vi.mocked(credibility.recalculateReportCredibility).mock.results[0]
        ?.value,
    ).resolves.toMatchObject({
      score: action === 'validate' ? 60 : 40,
      sufficientData: false,
      factors: {
        assessors: 1,
        validations: action === 'validate' ? 1 : 0,
        invalidations: action === 'invalidate' ? 1 : 0,
      },
    });
    expect(console.error).not.toHaveBeenCalled();
  },
);

it.each([
  'rpc error',
  'transport exception',
  'missing report',
  'invalid aggregates',
])(
  'preserves the committed receipt and logs once on credibility %s',
  async (failure) => {
    const sdk = rpc.getMockImplementation()!;
    rpc.mockImplementation((name, args) => {
      if (name !== 'report_credibility_inputs') return sdk(name, args);
      if (failure === 'transport exception')
        throw new Error('sensitive upstream detail');
      if (failure === 'rpc error')
        return Promise.resolve({
          error: { message: 'sensitive upstream detail' },
        });
      return Promise.resolve({
        data: failure === 'missing report' ? [] : [{}],
      });
    });
    const response = await run();
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual(result());
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      `No se pudo calcular la credibilidad del reporte ${report} [validation_added (${id})]`,
      expect.any(credibility.CredibilityError),
    );
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'my_permissions',
      'assessment_policy',
      'submit_report_assessment',
      'report_credibility_inputs',
    ]);
    expect(from).toHaveBeenCalledExactlyOnceWith('profiles');
  },
);

it.each([false, true])(
  'awaits the credibility attempt, including rejection=%s',
  async (reject) => {
    let resolve!: (value: unknown) => void;
    let rejectCalculation!: (reason: Error) => void;
    const pending = new Promise((yes, no) => {
      resolve = yes;
      rejectCalculation = no;
    });
    const sdk = rpc.getMockImplementation()!;
    rpc.mockImplementation((name, args) =>
      name === 'report_credibility_inputs' ? pending : sdk(name, args),
    );
    let finished = false;
    const operation = run().then((response) => {
      finished = true;
      return response;
    });
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(4));
    expect(finished).toBe(false);
    expect(credibility.recalculateReportCredibility).toHaveBeenCalledOnce();
    if (reject) rejectCalculation(new Error('private failure'));
    else resolve({ data: [aggregate()] });
    const response = await operation;
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(result());
    expect(console.error).toHaveBeenCalledTimes(reject ? 1 : 0);
  },
);

it('recalculates each confirmed history entry with its own trigger and fresh aggregates', async () => {
  const sdk = rpc.getMockImplementation()!;
  let latestAction = 'validate';
  rpc.mockImplementation((name, args) =>
    name === 'report_credibility_inputs'
      ? Promise.resolve({ data: [aggregate(latestAction)] })
      : sdk(name, args),
  );
  const ids = [
    id,
    '08000000-0000-4000-8000-000000000005',
    '08000000-0000-4000-8000-000000000006',
  ];
  for (const [index, action] of [
    'validate',
    'invalidate',
    'validate',
  ].entries()) {
    latestAction = action;
    submitResult = { data: { ...result(action), id: ids[index] } };
    expect(await (await run(JSON.stringify({ action }))).json()).toEqual(
      submitResult.data,
    );
    expect(credibility.recalculateReportCredibility).toHaveBeenNthCalledWith(
      index + 1,
      report,
      { cause: 'validation_added', triggerId: ids[index] },
      expect.objectContaining({ client: expect.anything() }),
    );
    await expect(
      vi.mocked(credibility.recalculateReportCredibility).mock.results[index]
        ?.value,
    ).resolves.toMatchObject({
      score: action === 'validate' ? 60 : 40,
      factors: { assessors: 1 },
    });
  }
  expect(
    rpc.mock.calls.filter(([name]) => name === 'submit_report_assessment'),
  ).toHaveLength(3);
  expect(
    rpc.mock.calls.filter(([name]) => name === 'report_credibility_inputs'),
  ).toHaveLength(3);
  // Latest-per-assessor selection remains the existing SQL responsibility; no SQL is simulated here.
});

const intermediateErrors = [
  { status: 401, code: 'PGRST301', expected: 401 },
  { status: 401, code: 'PGRST303', expected: 401 },
  { status: 401, code: '42501', expected: 401 },
  { status: undefined, code: 'PGRST301', expected: 401 },
  { status: undefined, code: 'PGRST302', expected: 401 },
  { status: undefined, code: 'PGRST303', expected: 401 },
  { status: 403, code: '42501', expected: 503 },
  { status: undefined, code: '42501', expected: 503 },
  { status: 500, code: 'PGRST300', expected: 503 },
  { status: 503, code: 'PGRST000', expected: 503 },
  { status: 0, code: '', expected: 503 },
  { status: undefined, code: 'unknown', expected: 503 },
  // An explicit infrastructure response must not be overridden by its payload.
  { status: 503, code: 'PGRST301', expected: 503 },
];
it.each(
  ['profile', 'my_permissions', 'assessment_policy'].flatMap((stage) =>
    intermediateErrors.map((error) => ({ stage, ...error })),
  ),
)(
  'classifies $stage status=$status code=$code as $expected without writing',
  async ({ stage, status, code, expected }) => {
    const upstream = {
      status,
      data: {
        permissions: ['assessments.submit'],
        minimumTrustLevel: 20,
        revision,
        id: actor,
        is_active: true,
        trust_level: 30,
      },
      error: {
        code,
        message: 'JWT expired: sensitive upstream detail',
        details: 'private detail',
        hint: 'private hint',
      },
    };
    if (stage === 'profile') maybeSingle.mockResolvedValue(upstream);
    else if (stage === 'assessment_policy') policyResult = upstream;
    else {
      const sdk = rpc.getMockImplementation()!;
      rpc.mockImplementation((name, args) =>
        name === stage ? Promise.resolve(upstream) : sdk(name, args),
      );
    }
    const response = await run();
    expect(response.status).toBe(expected);
    expect(await response.json()).toEqual({
      error:
        expected === 401
          ? {
              code: 'UNAUTHENTICATED',
              message: 'Se requiere una sesión válida.',
            }
          : {
              code: 'SERVICE_UNAVAILABLE',
              message: 'No se pudo completar la valoración.',
            },
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(
      stage === 'profile'
        ? []
        : stage === 'my_permissions'
          ? ['my_permissions']
          : ['my_permissions', 'assessment_policy'],
    );
    expect(credibility.recalculateReportCredibility).not.toHaveBeenCalled();
  },
);

it('returns the exact temporary-service error for Auth 429, without querying or writing', async () => {
  getUser.mockResolvedValue({
    data: { user: { id: actor } },
    error: {
      status: 429,
      code: 'over_request_rate_limit',
      message: 'private detail',
    },
  });
  const response = await run();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'No se pudo completar la valoración.',
    },
  });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect(credibility.recalculateReportCredibility).not.toHaveBeenCalled();
});

it('preserves the exact 403 contract for an effective permission denial', async () => {
  rpc.mockResolvedValue({ data: { permissions: [] }, error: null });
  const response = await run();
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: {
      code: 'FORBIDDEN',
      message: 'No tienes autorización para valorar este reporte.',
    },
  });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(rpc).toHaveBeenCalledExactlyOnceWith('my_permissions');
  expect(credibility.recalculateReportCredibility).not.toHaveBeenCalled();
});
