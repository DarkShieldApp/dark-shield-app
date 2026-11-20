import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseConfigurationError } from '../lib/supabase/config';
import {
  createAuthenticatedSupabaseClient,
  extractBearerToken,
  verifyBearer,
} from './session';
import type { RoleCode } from './profiles';

const permissions = [
  'reports.create',
  'evidences.add',
  'assessments.submit',
  'users.read',
  'users.change_role',
  'roles.manage_permissions',
] as const;
export type PermissionCode = (typeof permissions)[number];
export type EffectivePermissions = {
  roleCode: RoleCode;
  permissions: PermissionCode[];
};
export type UserPage = {
  items: {
    id: string;
    displayName: string | null;
    roleCode: RoleCode;
    isActive: boolean;
  }[];
  nextCursor: string | null;
};
export type PermissionMatrix = {
  permissions: {
    code: PermissionCode;
    name: string;
    description: string | null;
  }[];
  roles: Record<RoleCode, PermissionCode[]>;
};

const errors = {
  UNAUTHENTICATED: [401, 'Se requiere un token Bearer válido.'],
  INVALID_SESSION: [401, 'La sesión no es válida o ha caducado.'],
  FORBIDDEN: [403, 'El perfil no está autorizado para esta operación.'],
  INVALID_INPUT: [
    400,
    'Los parámetros o el cuerpo de la petición no son válidos.',
  ],
  USER_NOT_FOUND: [404, 'No existe el perfil indicado.'],
  AUTHORIZATION_CONFLICT: [
    409,
    'El cambio entra en conflicto con las reglas de administración.',
  ],
  SERVICE_UNAVAILABLE: [
    503,
    'El servicio de base de datos no está configurado.',
  ],
  INTERNAL_ERROR: [500, 'No se pudo completar la operación.'],
} as const;
class AuthorizationError extends Error {
  constructor(readonly code: keyof typeof errors) {
    super(code);
  }
}
const headers = { 'Cache-Control': 'private, no-store' };
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function validRole(role: unknown): role is RoleCode {
  return role === 'collaborator' || role === 'developer' || role === 'admin';
}
type RpcResults = {
  my_permissions: EffectivePermissions | null;
  list_users: UserPage;
  permission_matrix: PermissionMatrix;
  change_role: void;
  set_permission: void;
};
async function rpc<K extends keyof RpcResults>(
  client: SupabaseClient,
  name: K,
  args?: Record<string, unknown>,
): Promise<RpcResults[K]> {
  const { data, error, status } = await client.rpc(name, args);
  if (error) {
    if (status === 401) throw new AuthorizationError('INVALID_SESSION');
    const codes: Record<string, keyof typeof errors> = {
      '42501': 'FORBIDDEN',
      PT404: 'USER_NOT_FOUND',
      PT409: 'AUTHORIZATION_CONFLICT',
      '40001': 'AUTHORIZATION_CONFLICT',
      '22023': 'INVALID_INPUT',
    };
    throw new AuthorizationError(codes[error.code] ?? 'INTERNAL_ERROR');
  }
  return data as RpcResults[K];
}

type Operation = (
  client: SupabaseClient,
  me: EffectivePermissions,
) => Promise<unknown>;
async function authorized(
  request: Request,
  required: PermissionCode | null,
  operation: Operation,
) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) throw new AuthorizationError('UNAUTHENTICATED');
    const client = createAuthenticatedSupabaseClient(token);
    const { userId, error } = await verifyBearer(client, token);
    if (error && (error.status === 0 || (error.status ?? 0) >= 500)) {
      throw new AuthorizationError('INTERNAL_ERROR');
    }
    if (!userId) throw new AuthorizationError('INVALID_SESSION');
    const me = await rpc(client, 'my_permissions');
    if (
      !me ||
      (required &&
        (me.roleCode !== 'admin' || !me.permissions.includes(required)))
    ) {
      throw new AuthorizationError('FORBIDDEN');
    }
    const result = await operation(client, me);
    return result == null
      ? new Response(null, { status: 204, headers })
      : Response.json(result, { headers });
  } catch (error) {
    const code =
      error instanceof AuthorizationError
        ? error.code
        : error instanceof SupabaseConfigurationError
          ? 'SERVICE_UNAVAILABLE'
          : 'INTERNAL_ERROR';
    const [status, message] = errors[code];
    return Response.json({ error: { code, message } }, { status, headers });
  }
}

export function getMyPermissions(request: Request) {
  return authorized(request, null, async (_client, me) => me);
}
export function listUsers(request: Request) {
  return authorized(request, 'users.read', async (client) => {
    const params = new URL(request.url).searchParams;
    const rawLimit = params.get('limit') ?? '20';
    const cursor = params.get('cursor');
    if (
      !/^(?:[1-9]\d?|100)$/.test(rawLimit) ||
      (cursor !== null && !uuid.test(cursor)) ||
      params.getAll('limit').length > 1 ||
      params.getAll('cursor').length > 1
    )
      throw new AuthorizationError('INVALID_INPUT');
    return rpc(client, 'list_users', {
      page_size: Number(rawLimit),
      after_id: cursor,
    });
  });
}
export function getMatrix(request: Request) {
  return authorized(request, 'roles.manage_permissions', (client) =>
    rpc(client, 'permission_matrix'),
  );
}
export function changeRole(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return authorized(request, 'users.change_role', async (client) => {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (
      !uuid.test(id) ||
      !body ||
      !validRole(body.roleCode) ||
      Object.keys(body).length !== 1
    ) {
      throw new AuthorizationError('INVALID_INPUT');
    }
    await rpc(client, 'change_role', {
      target_id: id,
      requested_role: body.roleCode,
    });
  });
}
type AssignmentContext = {
  params: Promise<{ roleCode: string; permissionCode: string }>;
};
export function setPermission(
  request: Request,
  context: AssignmentContext,
  enabled: boolean,
) {
  return authorized(request, 'roles.manage_permissions', async (client) => {
    const { roleCode, permissionCode } = await context.params;
    if (
      !validRole(roleCode) ||
      !permissions.some((code) => code === permissionCode)
    )
      throw new AuthorizationError('INVALID_INPUT');
    await rpc(client, 'set_permission', {
      target_role: roleCode,
      capability: permissionCode,
      enabled,
    });
  });
}
