import type {
  EffectivePermissions,
  PermissionCode,
} from '../../server/authorization';

// HU-10/T2: Map effective permissions to user-readable actions.

export type AllowedAction = {
  code: PermissionCode;
  label: string;
};

const actionLabels: Record<PermissionCode, string> = {
  'reports.create': 'Crear reportes',
  'evidences.add': 'Aportar evidencias',
  'assessments.submit': 'Enviar valoraciones',
  'users.read': 'Consultar cuentas',
  'users.change_role': 'Cambiar roles de usuarios',
  'roles.manage_permissions': 'Gestionar permisos',
};

export function getAllowedActions(
  permissions: EffectivePermissions,
): AllowedAction[] {
  return permissions.permissions.map((code) => ({
    code,
    label: actionLabels[code],
  }));
}
