import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProfileData } from '../src/app/profile/profile-data';
import ProfileView from '../src/app/profile/profile-view';

// HU-10/T3: Test profile presentation with effective permissions.

const exampleData: ProfileData = {
  profile: {
    id: '11111111-1111-4111-8111-111111111111',
    display_name: 'Usuario de prueba',
    trust_level: 65,
    is_active: true,
    role_code: 'collaborator',
    created_at: '2026-11-19T10:00:00Z',
    updated_at: '2026-11-19T10:00:00Z',
  },
  authorization: {
    roleCode: 'collaborator',
    permissions: ['reports.create', 'evidences.add'],
  },
};

function renderProfile(data: ProfileData) {
  return renderToStaticMarkup(createElement(ProfileView, { data }));
}

describe('ProfileView', () => {
  it('displays the user name', () => {
    const html = renderProfile(exampleData);

    expect(html).toContain('Usuario de prueba');
  });

  it('displays the trust level', () => {
    const html = renderProfile(exampleData);

    expect(html).toContain('65 / 100');
    expect(html).toContain('aria-valuenow="65"');
  });

  it('displays the user role', () => {
    const html = renderProfile(exampleData);

    expect(html).toContain('Colaborador');
  });

  it('displays only the granted actions', () => {
    const html = renderProfile(exampleData);

    expect(html).toContain('Crear reportes');
    expect(html).toContain('Aportar evidencias');
    expect(html).not.toContain('Gestionar permisos');
  });

  it('handles users without a display name', () => {
    const data: ProfileData = {
      ...exampleData,
      profile: {
        ...exampleData.profile,
        display_name: null,
      },
    };

    expect(renderProfile(data)).toContain('Usuario');
  });

  it('displays a message when no actions are granted', () => {
    const data: ProfileData = {
      ...exampleData,
      authorization: {
        roleCode: 'collaborator',
        permissions: [],
      },
    };

    expect(renderProfile(data)).toContain(
      'No tienes acciones disponibles actualmente.',
    );
  });
});
