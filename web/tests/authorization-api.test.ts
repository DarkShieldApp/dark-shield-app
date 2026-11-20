import { beforeEach, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { GET as me } from '../src/app/api/me/permissions/route';
import { GET as users } from '../src/app/api/admin/users/route';
import { PATCH } from '../src/app/api/admin/users/[id]/role/route';
import { GET as matrix } from '../src/app/api/admin/roles/permissions/route';
import {
  PUT,
  DELETE,
} from '../src/app/api/admin/roles/[roleCode]/permissions/[permissionCode]/route';

vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
const token = 'fixture-bearer';
const id = '10000000-0000-4000-8000-000000000001';
const userContext = { params: Promise.resolve({ id }) };
const assignment = {
  params: Promise.resolve({
    roleCode: 'developer',
    permissionCode: 'reports.create',
  }),
};
const admin = {
  roleCode: 'admin',
  permissions: ['users.read', 'users.change_role', 'roles.manage_permissions'],
};
const getUser = vi.fn();
const rpc = vi.fn();
const req = (
  url = '',
  body?: string,
  auth: string | null = 'Bearer ' + token,
) =>
  new Request('http://localhost/api/' + url, {
    headers: auth ? { authorization: auth } : {},
    method: body === undefined ? 'GET' : 'PATCH',
    body,
  });
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.com');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.mocked(createClient).mockReturnValue({
    auth: { getUser },
    rpc,
  } as unknown as ReturnType<typeof createClient>);
  getUser
    .mockReset()
    .mockResolvedValue({ data: { user: { id } }, error: null });
  rpc.mockReset().mockResolvedValue({ data: admin, error: null });
});

it.each([null, 'Basic xyz', 'Bearer', 'Bearer one two', 'Bearer a,b'])(
  'rechaza cabecera %s antes de acceder a la BD',
  async (header) => {
    expect((await me(req('', undefined, header))).status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  },
);
it('valida el mismo Bearer con Auth y PostgREST usando clave publicable', async () => {
  const response = await me(req());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(admin);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(createClient).toHaveBeenCalledWith(
    'https://project.example.com',
    'sb_publishable_test',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers: { Authorization: 'Bearer ' + token } },
    },
  );
  expect(getUser).toHaveBeenCalledWith(token);
  expect(rpc).toHaveBeenCalledWith('my_permissions', undefined);
});
it('rechaza sesión caducada y perfil inactivo', async () => {
  getUser.mockResolvedValueOnce({
    data: { user: null },
    error: { message: 'secret' },
  });
  expect((await me(req())).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
  getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
  expect((await me(req())).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValueOnce({ data: null, error: null });
  expect((await me(req())).status).toBe(403);
});
it.each([
  { roleCode: 'developer', permissions: ['users.read'] },
  { roleCode: 'admin', permissions: [] },
])(
  'autoriza al actor antes de validar parámetros o consultar objetivos',
  async (profile) => {
    rpc.mockResolvedValueOnce({ data: profile, error: null });
    expect((await users(req('?limit=0'))).status).toBe(403);
    expect(rpc).toHaveBeenCalledTimes(1);
  },
);
it('devuelve la página y pasa límite y cursor a PostgreSQL', async () => {
  const page = {
    items: [{ id, roleCode: 'developer', displayName: null, isActive: true }],
    nextCursor: null,
  };
  rpc
    .mockResolvedValueOnce({ data: admin })
    .mockResolvedValueOnce({ data: page });
  expect(await (await users(req('?limit=100&cursor=' + id))).json()).toEqual(
    page,
  );
  expect(rpc).toHaveBeenLastCalledWith('list_users', {
    page_size: 100,
    after_id: id,
  });
  await users(req());
  expect(rpc).toHaveBeenLastCalledWith('list_users', {
    page_size: 20,
    after_id: null,
  });
});
it.each([
  'limit=0',
  'limit=101',
  'limit=1.1',
  'cursor=invalid',
  'cursor=',
  'limit=2&limit=3',
  'cursor=' + id + '&cursor=' + id,
])('rechaza paginación %s', async (query) => {
  expect((await users(req('?' + query))).status).toBe(400);
});
it('lee la matriz actual mediante la RPC autenticada', async () => {
  const data = {
    permissions: [],
    roles: { collaborator: [], admin: [], developer: [] },
  };
  rpc.mockResolvedValueOnce({ data: admin }).mockResolvedValueOnce({ data });
  expect(await (await matrix(req())).json()).toEqual(data);
  expect(rpc).toHaveBeenLastCalledWith('permission_matrix', undefined);
});
it.each([
  '{',
  'null',
  '{}',
  '{"roleCode":"owner"}',
  '{"roleCode":"admin","isAdmin":true}',
])('valida PATCH %s', async (body) => {
  expect((await PATCH(req('', body), userContext)).status).toBe(400);
});
it('rechaza UUID inválido', async () => {
  expect(
    (
      await PATCH(req('', '{"roleCode":"admin"}'), {
        params: Promise.resolve({ id: 'bad' }),
      })
    ).status,
  ).toBe(400);
});
it('cambia exclusivamente el rol del destino', async () => {
  const response = await PATCH(
    req('', '{"roleCode":"developer"}'),
    userContext,
  );
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  expect(rpc).toHaveBeenLastCalledWith('change_role', {
    target_id: id,
    requested_role: 'developer',
  });
});
it.each([
  [PUT, true],
  [DELETE, false],
] as const)('persiste la asignación solicitada', async (handler, enabled) => {
  expect((await handler(req(), assignment)).status).toBe(204);
  expect(rpc).toHaveBeenLastCalledWith('set_permission', {
    target_role: 'developer',
    capability: 'reports.create',
    enabled,
  });
});
it.each([
  ['stranger', 'reports.create'],
  ['admin', 'unknown'],
])('valida ambos códigos', async (roleCode, permissionCode) => {
  expect(
    (
      await PUT(req(), {
        params: Promise.resolve({ roleCode, permissionCode }),
      })
    ).status,
  ).toBe(400);
});
it.each([
  ['42501', 403, 'FORBIDDEN'],
  ['PT404', 404, 'USER_NOT_FOUND'],
  ['PT409', 409, 'AUTHORIZATION_CONFLICT'],
  ['22023', 400, 'INVALID_INPUT'],
  ['40001', 409, 'AUTHORIZATION_CONFLICT'],
  ['XX000', 500, 'INTERNAL_ERROR'],
  ['PGRST303', 401, 'INVALID_SESSION'],
])('traduce %s sin filtrar datos internos', async (code, status, expected) => {
  rpc.mockResolvedValueOnce({ data: admin }).mockResolvedValueOnce({
    status,
    error: { code, message: 'sensitive backend detail' },
  });
  const res = await PATCH(req('', '{"roleCode":"admin"}'), userContext);
  expect(res.status).toBe(status);
  expect(await res.json()).toEqual({
    error: {
      code: expected,
      message: expect.not.stringContaining('sensitive'),
    },
  });
});
it('distingue configuración ausente de fallo inesperado', async () => {
  getUser.mockResolvedValueOnce({
    data: { user: null },
    error: { status: 503 },
  });
  expect((await me(req())).status).toBe(500);
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockRejectedValueOnce(new Error('private detail'));
  expect((await me(req())).status).toBe(500);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
  expect((await me(req())).status).toBe(503);
});
