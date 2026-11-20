import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import { POST } from '../src/app/api/reports/route';
import {
  createAuthenticatedSupabaseClient,
  createReport,
  extractRegistrableDomain,
  normalizeReportTarget,
  parseAndValidateReportPayload,
  ReportApiError,
} from '../src/server/reports';

const VALID_BODY = {
  targetUrl: 'https://Shop.Example.co.uk/pricing?utm_source=ads#top',
  category: 'hidden_costs',
  title: 'Gastos de gestión ocultos hasta el pago final',
  description:
    'El precio inicial no incluye una comisión obligatoria que aparece al final.',
  stepsToReproduce:
    '1. Añadir producto al carrito.\n2. Avanzar al pago.\n3. Ver recargo.',
};

function buildMockSupabaseClient(options: {
  userId?: string | null;
  authError?: boolean;
  profile?: { id: string; is_active: boolean; role_code?: string } | null;
  profileError?: boolean;
  insertError?: boolean;
}) {
  const insertedRow = {
    id: '11111111-2222-3333-4444-555555555555',
    author_id: options.userId ?? 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    title: VALID_BODY.title,
    description: `${VALID_BODY.description}\n\nPasos para reproducir:\n${VALID_BODY.stepsToReproduce}`,
    pattern_type: VALID_BODY.category,
    target_url: 'https://shop.example.co.uk/pricing?utm_source=ads#top',
    page_key: 'https://shop.example.co.uk/pricing',
    target_host: 'shop.example.co.uk',
    registrable_domain: 'example.co.uk',
    created_at: '2026-11-18T19:00:00.000Z',
  };

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: options.userId ? { id: options.userId } : null },
        error: options.authError ? new Error('Invalid token') : null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: options.profile ?? null,
                error: options.profileError ? new Error('DB error') : null,
              }),
            }),
          }),
        };
      }

      return {
        insert: () => ({
          select: () => ({
            single: vi.fn().mockResolvedValue({
              data: options.insertError ? null : insertedRow,
              error: options.insertError ? new Error('Insert denied') : null,
            }),
          }),
        }),
      };
    }),
  };

  return client as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.com');
  vi.stubEnv(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'sb_publishable_unit_test_only',
  );
});

describe('normalización y validación de payload en servidor', () => {
  it('extrae correctamente dominios registrables simples y multiparte', () => {
    expect(extractRegistrableDomain('example.com')).toBe('example.com');
    expect(extractRegistrableDomain('blog.shop.example.com')).toBe(
      'example.com',
    );
    expect(extractRegistrableDomain('blog.shop.example.co.uk')).toBe(
      'example.co.uk',
    );
  });

  it('obtiene el dominio registrable con la Public Suffix List, incluida la sección privada', () => {
    expect(extractRegistrableDomain('example.co.uk')).toBe('example.co.uk');
    expect(extractRegistrableDomain('shop.example.com.co')).toBe(
      'example.com.co',
    );
    // Sección privada: cada sitio de GitHub Pages o Blogspot es un dominio propio.
    expect(extractRegistrableDomain('ana.github.io')).toBe('ana.github.io');
    expect(extractRegistrableDomain('docs.ana.github.io')).toBe(
      'ana.github.io',
    );
    expect(extractRegistrableDomain('bar.blogspot.com')).toBe(
      'bar.blogspot.com',
    );
    // Límite de etiqueta: no se confunden dominios parecidos.
    expect(extractRegistrableDomain('notexample.com')).toBe('notexample.com');
    expect(extractRegistrableDomain('example.com.attacker.test')).toBe(
      'attacker.test',
    );
    expect(extractRegistrableDomain('Example.COM.')).toBe('example.com');
  });

  it('usa el host como clave cuando la PSL no da dominio registrable (IP o sufijo)', () => {
    expect(extractRegistrableDomain('192.168.1.1')).toBe('192.168.1.1');
    expect(extractRegistrableDomain('[::1]')).toBe('[::1]');
    expect(extractRegistrableDomain('github.io')).toBe('github.io');
  });

  it('normaliza destinos con IDN, sufijos privados e IP', () => {
    expect(normalizeReportTarget('https://Bücher.example/Ruta/')).toEqual({
      targetUrl: 'https://xn--bcher-kva.example/Ruta/',
      pageKey: 'https://xn--bcher-kva.example/Ruta/',
      targetHost: 'xn--bcher-kva.example',
      registrableDomain: 'xn--bcher-kva.example',
    });
    expect(
      normalizeReportTarget('https://docs.ana.github.io/guia')
        .registrableDomain,
    ).toBe('ana.github.io');
    expect(
      normalizeReportTarget('http://192.168.1.1:8080/admin').registrableDomain,
    ).toBe('192.168.1.1');
  });

  it('normaliza page_key sin query ni fragmento', () => {
    const normalized = normalizeReportTarget(VALID_BODY.targetUrl);
    expect(normalized.targetHost).toBe('shop.example.co.uk');
    expect(normalized.registrableDomain).toBe('example.co.uk');
    expect(normalized.pageKey).toBe('https://shop.example.co.uk/pricing');
  });

  it('acepta campos tanto en camelCase como en snake_case', () => {
    const parsed = parseAndValidateReportPayload({
      target_url: 'https://ejemplo.com/ruta',
      pattern_type: 'roach_motel',
      title: 'Título válido de prueba',
      description: 'Descripción suficientemente larga para ser válida.',
      steps_to_reproduce: '1. Entrar.\n2. Pulsar cancelar.',
    });
    expect(parsed.targetUrl).toBe('https://ejemplo.com/ruta');
    expect(parsed.category).toBe('roach_motel');
  });

  it('rechaza payloads no objeto, tipos inválidos, caracteres de control y URLs excesivas', () => {
    expect(() => parseAndValidateReportPayload(null)).toThrow(ReportApiError);
    expect(() => parseAndValidateReportPayload([])).toThrow(ReportApiError);
    expect(() =>
      parseAndValidateReportPayload({ ...VALID_BODY, title: 123 }),
    ).toThrow('cadena de texto');
    expect(() =>
      parseAndValidateReportPayload({ ...VALID_BODY, title: '' }),
    ).toThrow('errores de validación');
    expect(() =>
      parseAndValidateReportPayload({
        ...VALID_BODY,
        title: 'Título\u0007malo',
      }),
    ).toThrow('caracteres de control');
    expect(() =>
      parseAndValidateReportPayload({
        ...VALID_BODY,
        targetUrl: `https://ejemplo.com/${'a'.repeat(2040)}`,
      }),
    ).toThrow('2048');
  });
});

describe('createReport y endpoint POST /api/reports', () => {
  it('crea cliente autenticado sin persistir sesión', () => {
    const client = createAuthenticatedSupabaseClient('token-demo');
    expect(client).toBeDefined();
  });

  it('persiste el reporte cuando el colaborador está autenticado y activo', async () => {
    const mockClient = buildMockSupabaseClient({
      userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      profile: {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        is_active: true,
        role_code: 'collaborator',
      },
    });

    const created = await createReport(
      VALID_BODY,
      'valid-jwt-token',
      mockClient,
    );
    expect(created.id).toBe('11111111-2222-3333-4444-555555555555');
    expect(created.registrable_domain).toBe('example.co.uk');
  });

  it('rechaza peticiones sin token, con sesión inválida, perfil inactivo o error BD', async () => {
    await expect(createReport(VALID_BODY, null)).rejects.toMatchObject({
      status: 401,
    });

    const invalidAuthClient = buildMockSupabaseClient({ authError: true });
    await expect(
      createReport(VALID_BODY, 'bad-token', invalidAuthClient),
    ).rejects.toMatchObject({ status: 401 });

    const inactiveClient = buildMockSupabaseClient({
      userId: 'u1',
      profile: { id: 'u1', is_active: false },
    });
    await expect(
      createReport(VALID_BODY, 'token', inactiveClient),
    ).rejects.toMatchObject({ status: 403 });

    const wrongRoleClient = buildMockSupabaseClient({
      userId: 'u1',
      profile: { id: 'u1', is_active: true, role_code: 'developer' },
    });
    await expect(
      createReport(VALID_BODY, 'token', wrongRoleClient),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN_ROLE' });

    const profileErrorClient = buildMockSupabaseClient({
      userId: 'u1',
      profileError: true,
    });
    await expect(
      createReport(VALID_BODY, 'token', profileErrorClient),
    ).rejects.toMatchObject({ status: 500 });

    const insertErrorClient = buildMockSupabaseClient({
      userId: 'u1',
      profile: { id: 'u1', is_active: true, role_code: 'collaborator' },
      insertError: true,
    });
    await expect(
      createReport(VALID_BODY, 'token', insertErrorClient),
    ).rejects.toMatchObject({ status: 500 });
  });

  it('POST /api/reports devuelve 400 con JSON inválido o datos erróneos y 401 sin Bearer', async () => {
    const badJsonReq = new Request('http://localhost/api/reports', {
      method: 'POST',
      body: '{no-json',
    });
    const badJsonRes = await POST(badJsonReq);
    expect(badJsonRes.status).toBe(400);

    const invalidFieldsReq = new Request('http://localhost/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });
    const invalidFieldsRes = await POST(invalidFieldsReq);
    expect(invalidFieldsRes.status).toBe(400);

    const unauthReq = new Request('http://localhost/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    const unauthRes = await POST(unauthReq);
    expect(unauthRes.status).toBe(401);
  });

  it('POST /api/reports devuelve 503 si falta configuración de Supabase', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
    const req = new Request('http://localhost/api/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-valido',
      },
      body: JSON.stringify(VALID_BODY),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });
});
