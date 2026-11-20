import { beforeEach, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { POST } from '../src/app/api/reports/[reportId]/assessments/route';

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
const run = (
  body?: string,
  reportId = report,
  header: string | null = 'Bearer token',
) => POST(request(body, header), { params: Promise.resolve({ reportId }) });
let submitResult: {
  data: unknown;
  error?: { code: string; message?: string };
  status?: number;
};
let policyResult: { data: unknown; error?: object };
beforeEach(() => {
  vi.resetAllMocks();
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
    async (name: string, args?: { requested_action: string }) => {
      if (name === 'my_permissions')
        return {
          data: { roleCode: 'developer', permissions: ['assessments.submit'] },
        };
      if (name === 'assessment_policy') return policyResult;
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
    expect(rpc).toHaveBeenLastCalledWith('submit_report_assessment', {
      target_report_id: report,
      requested_action: action,
      expected_policy_revision: revision,
    });
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
  resolve({ data: result() });
  expect((await operation).status).toBe(201);
});
