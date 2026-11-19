import { describe, expect, it } from 'vitest';
import type { EffectivePermissions } from '../src/server/authorization';
import { getAllowedActions } from '../src/app/profile/permission-actions';

// HU-10/T2: Test the mapping of permissions to user actions.

describe('getAllowedActions', () => {
  it('returns collaborator actions', () => {
    const permissions: EffectivePermissions = {
      roleCode: 'collaborator',
      permissions: ['reports.create', 'evidences.add', 'assessments.submit'],
    };

    expect(getAllowedActions(permissions)).toEqual([
      { code: 'reports.create', label: 'Crear reportes' },
      { code: 'evidences.add', label: 'Aportar evidencias' },
      { code: 'assessments.submit', label: 'Enviar valoraciones' },
    ]);
  });

  it('returns all six actions when granted', () => {
    const permissions: EffectivePermissions = {
      roleCode: 'admin',
      permissions: [
        'reports.create',
        'evidences.add',
        'assessments.submit',
        'users.read',
        'users.change_role',
        'roles.manage_permissions',
      ],
    };

    expect(getAllowedActions(permissions)).toHaveLength(6);
  });

  it('returns an empty list without permissions', () => {
    const permissions: EffectivePermissions = {
      roleCode: 'developer',
      permissions: [],
    };

    expect(getAllowedActions(permissions)).toEqual([]);
  });

  it('uses effective permissions, not fixed role assignments', () => {
    const permissions: EffectivePermissions = {
      roleCode: 'collaborator',
      permissions: ['evidences.add'],
    };

    expect(getAllowedActions(permissions)).toEqual([
      { code: 'evidences.add', label: 'Aportar evidencias' },
    ]);
  });

  it('does not modify the original permissions', () => {
    const permissions: EffectivePermissions = {
      roleCode: 'collaborator',
      permissions: ['reports.create'],
    };

    getAllowedActions(permissions);

    expect(permissions.permissions).toEqual(['reports.create']);
  });
});
