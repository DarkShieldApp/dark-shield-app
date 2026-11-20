import { beforeEach, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { checkAssessmentAuthorization } from '../src/server/assessment-authorization';

vi.mock('server-only', () => ({}));
// Keep session.ts, profile-query.ts and the server factory real; fake only SDK I/O.
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const id = '08111111-1111-4111-8111-111111111111';
const otherId = '08222222-2222-4222-8222-222222222222';
const bearer = 'Bearer fixture-access-token';
const getUser = vi.fn();
const rpc = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn();
const select = vi.fn();
const from = vi.fn();

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id,
    display_name: null,
    trust_level: 50,
    is_active: true,
    role_code: 'collaborator',
    created_at: '2026-11-19T12:00:00Z',
    updated_at: '2026-11-19T12:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.com');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  // Test fixture only: no production default or approved business threshold.
  vi.stubEnv('ASSESSMENTS_MIN_TRUST_LEVEL', '40');
  getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  rpc.mockResolvedValue({
    data: { roleCode: 'collaborator', permissions: ['assessments.submit'] },
    error: null,
  });
  maybeSingle.mockResolvedValue({ data: profile(), error: null });
  const query = { select, eq, maybeSingle };
  from.mockReturnValue(query);
  select.mockReturnValue(query);
  eq.mockReturnValue(query);
  vi.mocked(createClient).mockReturnValue({
    auth: { getUser },
    rpc,
    from,
  } as unknown as ReturnType<typeof createClient>);
});

it('authorizes using verified identity, the live permission and persisted trust', async () => {
  expect(await checkAssessmentAuthorization(bearer)).toEqual({
    allowed: true,
    assessorId: id,
    trustLevel: 50,
    minimumTrustLevel: 40,
  });
  expect(getUser).toHaveBeenCalledWith('fixture-access-token');
  expect(createClient).toHaveBeenCalledWith(
    'https://project.example.com',
    'sb_publishable_test',
    {
      global: { headers: { Authorization: bearer } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  expect(from).toHaveBeenCalledExactlyOnceWith('profiles');
  expect(select).toHaveBeenCalledWith(
    'id, display_name, trust_level, is_active, role_code, created_at, updated_at',
  );
  expect(eq.mock.calls).toEqual([
    ['id', id],
    ['is_active', true],
  ]);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('my_permissions');
});

it.each([1, 40, 100])(
  'allows trust exactly equal to the configured minimum %i',
  async (minimum) => {
    vi.stubEnv('ASSESSMENTS_MIN_TRUST_LEVEL', String(minimum));
    maybeSingle.mockResolvedValue({
      data: profile({ trust_level: minimum }),
      error: null,
    });
    expect(await checkAssessmentAuthorization(bearer)).toEqual({
      allowed: true,
      assessorId: id,
      trustLevel: minimum,
      minimumTrustLevel: minimum,
    });
  },
);

it('denies trust below the minimum', async () => {
  maybeSingle.mockResolvedValue({
    data: profile({ trust_level: 39 }),
    error: null,
  });
  expect(await checkAssessmentAuthorization(bearer)).toEqual({
    allowed: false,
    reason: 'INSUFFICIENT_TRUST',
  });
});

it.each(['collaborator', 'developer', 'admin'])(
  'requires the collaborator role and its permission (%s)',
  async (role) => {
    maybeSingle.mockResolvedValue({
      data: profile({ role_code: role }),
      error: null,
    });
    rpc.mockResolvedValue({
      data: { roleCode: role, permissions: ['assessments.submit'] },
      error: null,
    });
    const authorization = await checkAssessmentAuthorization(bearer);
    expect(authorization.allowed).toBe(role === 'collaborator');
    rpc.mockResolvedValue({
      data: { roleCode: role, permissions: ['reports.create'] },
      error: null,
    });
    expect(await checkAssessmentAuthorization(bearer)).toEqual({
      allowed: false,
      reason: 'PERMISSION_DENIED',
    });
  },
);

it('reads permissions on every call and reflects a revocation with the same token', async () => {
  expect((await checkAssessmentAuthorization(bearer)).allowed).toBe(true);
  rpc.mockResolvedValue({
    data: { roleCode: 'collaborator', permissions: [] },
    error: null,
  });
  expect(await checkAssessmentAuthorization(bearer)).toEqual({
    allowed: false,
    reason: 'PERMISSION_DENIED',
  });
  expect(getUser).toHaveBeenCalledTimes(2);
  expect(maybeSingle).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenCalledTimes(2);
});

it('reads trust, account state and policy again on subsequent checks', async () => {
  expect((await checkAssessmentAuthorization(bearer)).allowed).toBe(true);
  vi.stubEnv('ASSESSMENTS_MIN_TRUST_LEVEL', '51');
  expect(await checkAssessmentAuthorization(bearer)).toEqual({
    allowed: false,
    reason: 'INSUFFICIENT_TRUST',
  });
  maybeSingle.mockResolvedValue({
    data: profile({ trust_level: 51 }),
    error: null,
  });
  expect((await checkAssessmentAuthorization(bearer)).allowed).toBe(true);
  maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await checkAssessmentAuthorization(bearer)).toEqual({
    allowed: false,
    reason: 'PROFILE_UNAVAILABLE',
  });
  vi.stubEnv('ASSESSMENTS_MIN_TRUST_LEVEL', undefined);
  expect(await checkAssessmentAuthorization(bearer)).toEqual({
    allowed: false,
    reason: 'POLICY_UNAVAILABLE',
  });
});

it.each([
  null,
  profile({ is_active: false }),
  profile({ is_active: 'true' }),
  profile({ id: otherId }),
  {},
])('denies missing, inactive or mismatched profile %#', async (data) => {
  maybeSingle.mockResolvedValue({ data, error: null });
  expect(await checkAssessmentAuthorization(bearer)).toEqual({
    allowed: false,
    reason: 'PROFILE_UNAVAILABLE',
  });
  expect(rpc).not.toHaveBeenCalled();
});

it.each([undefined, null, 0, -1, 101, 1.5, NaN, Infinity, '50'])(
  'denies invalid persisted trust %s',
  async (trust_level) => {
    maybeSingle.mockResolvedValue({
      data: profile({ trust_level }),
      error: null,
    });
    expect(await checkAssessmentAuthorization(bearer)).toEqual({
      allowed: false,
      reason: 'INVALID_TRUST_LEVEL',
    });
  },
);

it.each([
  null,
  {},
  { permissions: null },
  { permissions: 'assessments.submit' },
  { permissions: [] },
  { permissions: ['assessments.submit', 1] },
])('denies missing or malformed permission data %#', async (data) => {
  rpc.mockResolvedValue({ data, error: null });
  expect(await checkAssessmentAuthorization(bearer)).toEqual({
    allowed: false,
    reason: 'PERMISSION_DENIED',
  });
});

it.each([null, '', 'Basic token', 'Bearer', 'Bearer a,b', 'Bearer a b'])(
  'denies missing or malformed bearer %s',
  async (header) => {
    expect(await checkAssessmentAuthorization(header)).toEqual({
      allowed: false,
      reason: 'UNAUTHENTICATED',
    });
    expect(createClient).not.toHaveBeenCalled();
  },
);

it.each([
  { data: { user: null }, error: null },
  { data: { user: null }, error: { status: 401, code: 'bad_jwt' } },
  { data: { user: null }, error: { status: 401, code: 'jwt_expired' } },
  { data: { user: { id } }, error: { message: 'invalid session' } },
])('denies absent, invalid or expired sessions %#', async (result) => {
  getUser.mockResolvedValue(result);
  expect(await checkAssessmentAuthorization(bearer)).toEqual({
    allowed: false,
    reason: 'INVALID_SESSION',
  });
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

it.each([0, 500, 503])('denies Auth service failure %i', async (status) => {
  getUser.mockResolvedValue({ data: { user: null }, error: { status } });
  expect(await checkAssessmentAuthorization(bearer)).toEqual({
    allowed: false,
    reason: 'SERVICE_UNAVAILABLE',
  });
  expect(from).not.toHaveBeenCalled();
});

it.each(['auth', 'profile', 'permissions', 'configuration'])(
  'denies a thrown %s failure without leaking details',
  async (source) => {
    const failure = new Error('sensitive upstream detail');
    if (source === 'auth') getUser.mockRejectedValue(failure);
    if (source === 'profile') maybeSingle.mockRejectedValue(failure);
    if (source === 'permissions') rpc.mockRejectedValue(failure);
    if (source === 'configuration') vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(await checkAssessmentAuthorization(bearer)).toEqual({
      allowed: false,
      reason: 'SERVICE_UNAVAILABLE',
    });
  },
);

it.each(['profile', 'permissions'])(
  'denies a %s query error even if data is also present',
  async (source) => {
    if (source === 'profile')
      maybeSingle.mockResolvedValue({
        data: profile(),
        error: { message: 'failure' },
      });
    else
      rpc.mockResolvedValue({
        data: { permissions: ['assessments.submit'] },
        error: { code: '42501' },
      });
    expect(await checkAssessmentAuthorization(bearer)).toEqual({
      allowed: false,
      reason: 'SERVICE_UNAVAILABLE',
    });
  },
);

it.each([
  undefined,
  '',
  '0',
  '-1',
  '101',
  '1.5',
  '40.0',
  'NaN',
  'Infinity',
  'abc',
  '40x',
  '4e1',
  '0x28',
  '+40',
  '040',
  ' 40',
  '40 ',
  '40\n',
  '40\r',
  '４０',
])('denies invalid minimum %s without contacting Supabase', async (minimum) => {
  vi.stubEnv('ASSESSMENTS_MIN_TRUST_LEVEL', minimum);
  expect(await checkAssessmentAuthorization(bearer)).toEqual({
    allowed: false,
    reason: 'POLICY_UNAVAILABLE',
  });
  expect(createClient).not.toHaveBeenCalled();
});

it('ignores user IDs, trust, roles and policy supplied outside the verified token', async () => {
  const request = new Request('https://example.com/?userId=' + otherId, {
    method: 'POST',
    headers: {
      authorization: bearer,
      'x-user-id': otherId,
      'x-min-trust-level': '1',
    },
    body: JSON.stringify({
      assessorId: otherId,
      trust_level: 100,
      role_code: 'admin',
      minimumTrustLevel: 1,
    }),
  });
  getUser.mockResolvedValue({
    data: {
      user: { id, user_metadata: { userId: otherId, trust_level: 100 } },
    },
    error: null,
  });
  maybeSingle.mockResolvedValue({
    data: profile({ trust_level: 1 }),
    error: null,
  });
  expect(
    await checkAssessmentAuthorization(request.headers.get('authorization')),
  ).toEqual({ allowed: false, reason: 'INSUFFICIENT_TRUST' });
  expect(eq).toHaveBeenCalledWith('id', id);
  expect(eq).not.toHaveBeenCalledWith('id', otherId);
  expect(rpc).toHaveBeenCalledWith('my_permissions');
});

it('does not share identity or clients across users', async () => {
  expect((await checkAssessmentAuthorization(bearer)).allowed).toBe(true);
  getUser.mockResolvedValue({ data: { user: { id: otherId } }, error: null });
  maybeSingle.mockResolvedValue({
    data: profile({ id: otherId }),
    error: null,
  });
  expect(await checkAssessmentAuthorization('Bearer second-token')).toEqual({
    allowed: true,
    assessorId: otherId,
    trustLevel: 50,
    minimumTrustLevel: 40,
  });
  expect(createClient).toHaveBeenCalledTimes(2);
  expect(getUser).toHaveBeenLastCalledWith('second-token');
  expect(eq).toHaveBeenCalledWith('id', otherId);
});
