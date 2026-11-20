import { describe, expect, it } from 'vitest';
import { isActiveCollaborator } from '../src/lib/auth/collaborator';
import { getSafeReturnPath } from '../src/lib/auth/return-path';

describe('guard de colaborador', () => {
  it('solo admite perfiles activos con el rol de colaborador', () => {
    expect(
      isActiveCollaborator({ role_code: 'collaborator', is_active: true }),
    ).toBe(true);
    expect(
      isActiveCollaborator({ role_code: 'developer', is_active: true }),
    ).toBe(false);
    expect(
      isActiveCollaborator({ role_code: 'collaborator', is_active: false }),
    ).toBe(false);
    expect(isActiveCollaborator(null)).toBe(false);
  });

  it('solo permite destinos de retorno en el mismo sitio', () => {
    expect(
      getSafeReturnPath('/reports/new?draft=1', 'https://darkshield.example'),
    ).toBe('/reports/new?draft=1');
    expect(
      getSafeReturnPath('//attacker.example', 'https://darkshield.example'),
    ).toBeNull();
    expect(
      getSafeReturnPath(
        'https://attacker.example',
        'https://darkshield.example',
      ),
    ).toBeNull();
  });
});
