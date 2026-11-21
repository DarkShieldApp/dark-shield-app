// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/components/AuthProvider';
import { ReportSummaryCard } from '../src/components/ReportSummaryCard';
import Dashboard from '../src/app/dashboard';
import { createBrowserSupabaseClient } from '../src/lib/supabase/client';
import {
  ASSESSMENT_UNCONFIRMED,
  sendReportAssessment,
} from '../src/lib/reports/assessments';

vi.mock('client-only', () => ({}));
// The provider, session reader, component and HTTP consumer remain real.
vi.mock('../src/lib/supabase/client', () => ({
  createBrowserSupabaseClient: vi.fn(),
}));

const reportId = '08a55555-1111-4111-8111-111111111111';
const otherReport = '08a55555-2222-4222-8222-222222222222';
const actor = '08a55555-3333-4333-8333-333333333333';
const session = {
  access_token: 'initial-token',
  user: { id: actor },
} as Session;
const receipt = (action = 'validate', report = reportId) => ({
  id: '08a55555-4444-4444-8444-444444444444',
  reportId: report,
  action,
  createdAt: '2026-11-21T12:00:00.000001+00:00',
});
const getSession = vi.fn();
const unsubscribe = vi.fn();
const fetcher = vi.fn();
let onSession: (event: string, value: Session | null) => void;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetcher);
  getSession.mockResolvedValue({
    data: { session: { access_token: 'current-token' } },
    error: null,
  });
  vi.mocked(createBrowserSupabaseClient).mockReturnValue({
    auth: {
      getSession,
      onAuthStateChange: (callback: typeof onSession) => {
        onSession = callback;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  } as unknown as ReturnType<typeof createBrowserSupabaseClient>);
  fetcher.mockImplementation(async (_url, options) =>
    Response.json(receipt(JSON.parse(options.body).action), { status: 201 }),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function mount(ids = [reportId]) {
  await act(async () =>
    root.render(
      createElement(
        AuthProvider,
        null,
        ids.map((id) =>
          createElement(ReportSummaryCard, {
            key: id,
            report: {
              id,
              title: 'Reporte ' + id,
              description: 'Descripción del reporte',
              pattern_type: null,
              target_url: 'https://example.test/',
              page_key: 'https://example.test/',
              created_at: '2026-11-20T12:00:00Z',
              credibility: null,
            },
          }),
        ),
      ),
    ),
  );
}
async function authenticate(value: Session | null = session) {
  await act(async () => onSession('SIGNED_IN', value));
}
function buttons(id = reportId) {
  return [
    ...container.querySelectorAll<HTMLButtonElement>(`#report-${id} button`),
  ];
}
async function click(index = 0, id = reportId) {
  await act(async () => buttons(id)[index]!.click());
}
it('renders both controls in each public card, then offers a safe login link to guests', async () => {
  await mount([reportId, otherReport]);
  expect(container.querySelectorAll('article')).toHaveLength(2);
  expect(container.textContent).toContain('Credibilidad no disponible');
  expect(container.textContent).toContain('Comprobando sesión…');
  expect(buttons().map((button) => button.textContent)).toEqual([
    'Validar reporte',
    'Invalidar reporte',
  ]);
  expect(buttons().every((button) => button.disabled)).toBe(true);
  await authenticate(null);
  await click();
  expect(container.textContent).toContain(
    'Inicia sesión para validar o invalidar reportes.',
  );
  const link = container.querySelector('a')!;
  expect(link.getAttribute('href')).toBe('/login?next=%2Fconsulta');
  expect(getSession).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(['validate', 'invalidate'])(
  'sends %s for the actual card with the current HU-11 token',
  async (action) => {
    await mount();
    await authenticate();
    await click(action === 'validate' ? 0 : 1);
    expect(getSession).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      `/api/reports/${reportId}/assessments`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer current-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
        cache: 'no-store',
        redirect: 'error',
      },
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      action === 'validate'
        ? 'Validación registrada.'
        : 'Invalidación registrada.',
    );
    expect(container.textContent).toContain('nueva consulta');
    expect(container.textContent).toContain('Credibilidad no disponible');
    expect(buttons().every((button) => !button.disabled)).toBe(true);
  },
);
it('locks both actions synchronously, awaits confirmation and keeps cards independent', async () => {
  let resolve!: (value: Response) => void;
  fetcher.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  await mount([reportId, otherReport]);
  await authenticate();
  await act(async () => {
    buttons()[0]!.click();
    buttons()[1]!.click();
    buttons()[0]!.click();
  });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(buttons().every((button) => button.disabled)).toBe(true);
  expect(buttons(otherReport).every((button) => !button.disabled)).toBe(true);
  expect(container.querySelector('section[aria-busy="true"]')).not.toBeNull();
  expect(container.textContent).toContain('Guardando valoración…');
  expect(container.textContent).not.toContain('registrada.');
  fetcher.mockResolvedValue(
    Response.json(receipt('invalidate', otherReport), { status: 201 }),
  );
  await click(1, otherReport);
  expect(fetcher.mock.calls[1]?.[0]).toContain(otherReport);
  expect(
    container.querySelector(`#report-${otherReport}`)?.textContent,
  ).toContain('Invalidación registrada.');
  await act(async () => resolve(Response.json(receipt(), { status: 201 })));
  expect(container.querySelector(`#report-${reportId}`)?.textContent).toContain(
    'Validación registrada.',
  );
});
it.each([
  [400, 'INVALID_INPUT', 'Revisa el reporte'],
  [401, 'UNAUTHENTICATED', 'ha caducado'],
  [403, 'FORBIDDEN', 'no tiene autorización'],
  [403, 'OWN_REPORT', 'propio reporte'],
  [404, 'REPORT_NOT_FOUND', 'ya no está disponible'],
  [409, 'ASSESSMENT_CONFLICT', 'condiciones cambiaron'],
  [503, 'POLICY_UNAVAILABLE', 'política de participación'],
  [503, 'SERVICE_UNAVAILABLE', 'podría haberse guardado'],
] as const)(
  'presents safe feedback for %i %s without retrying',
  async (status, code, message) => {
    fetcher.mockResolvedValue(
      Response.json(
        { error: { code, message: 'secret internal detail' } },
        { status },
      ),
    );
    await mount();
    await authenticate();
    await click();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      message,
    );
    expect(container.textContent).not.toContain('secret internal detail');
    expect(container.textContent).not.toContain('registrada.');
    expect(fetcher).toHaveBeenCalledOnce();
    if (status === 401)
      expect(container.querySelector('a')?.getAttribute('href')).toBe(
        '/login?next=%2Fconsulta',
      );
  },
);
it.each([
  [200, receipt()],
  [201, null],
  [201, []],
  [201, {}],
  [201, { ...receipt(), id: 'bad' }],
  [201, { ...receipt(), reportId: otherReport }],
  [201, { ...receipt(), action: 'invalidate' }],
  [201, { ...receipt(), createdAt: null }],
  [201, { ...receipt(), createdAt: 'bad' }],
  [201, { ...receipt(), extra: 'secret' }],
  [500, { error: { code: 'UNAUTHENTICATED' } }],
  [503, { error: { code: '__proto__' } }],
] as const)(
  'does not claim success for unexpected response %#',
  async (status, body) => {
    fetcher.mockResolvedValue(Response.json(body, { status }));
    await mount();
    await authenticate();
    await click();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      ASSESSMENT_UNCONFIRMED,
    );
    expect(fetcher).toHaveBeenCalledOnce();
  },
);
it.each(['network', 'json'])(
  'does not retry after a %s failure',
  async (kind) => {
    if (kind === 'network')
      fetcher.mockRejectedValue(new Error('secret network error'));
    else fetcher.mockResolvedValue(new Response('not json', { status: 201 }));
    await mount();
    await authenticate();
    await click();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      ASSESSMENT_UNCONFIRMED,
    );
    expect(fetcher).toHaveBeenCalledOnce();
  },
);
it.each([null, 'session-error'])(
  'does not write when getAccessToken has no valid session (%s)',
  async (kind) => {
    getSession.mockResolvedValue({ data: { session: null }, error: kind });
    await mount();
    await authenticate();
    await click();
    expect(fetcher).not.toHaveBeenCalled();
    expect(container.textContent).toContain('ha caducado');
    expect(container.querySelector('a')).not.toBeNull();
  },
);
it('handles a failed session read without leaking details', async () => {
  getSession.mockRejectedValue(new Error('secret session error'));
  await mount();
  await authenticate();
  await click();
  expect(container.textContent).toContain(
    'No se ha enviado ninguna valoración',
  );
  expect(container.textContent).not.toContain('secret');
  expect(fetcher).not.toHaveBeenCalled();
});
it('does not submit if the user signs out while reading the token', async () => {
  let resolve!: (value: unknown) => void;
  getSession.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await mount();
  await authenticate();
  await click();
  await authenticate(null);
  await act(async () =>
    resolve({ data: { session: { access_token: 'old' } }, error: null }),
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Inicia sesión');
});
it('ignores a late result after logout and never shows it to the next account', async () => {
  let resolve!: (value: Response) => void;
  fetcher.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await mount();
  await authenticate();
  await click();
  await authenticate({
    ...session,
    user: { ...session.user, id: 'different-user' },
  });
  await act(async () => resolve(Response.json(receipt(), { status: 201 })));
  expect(container.textContent).not.toContain('registrada.');
  expect(buttons().every((button) => !button.disabled)).toBe(true);
});
it('shows sanitized provider failures and disables all actions', async () => {
  vi.mocked(createBrowserSupabaseClient).mockImplementation(() => {
    throw new Error('secret config');
  });
  await mount();
  await click();
  expect(container.textContent).toContain('No se pudo comprobar la sesión');
  expect(container.textContent).not.toContain('secret config');
  expect(fetcher).not.toHaveBeenCalled();
});
it('uses keyboard-focusable native buttons, an accessible group and live feedback', async () => {
  await mount();
  await authenticate();
  buttons()[0]!.focus();
  expect(document.activeElement).toBe(buttons()[0]);
  expect(buttons()[0]?.type).toBe('button');
  expect(container.querySelector('section')?.getAttribute('aria-label')).toBe(
    'Valorar este reporte',
  );
  expect(
    container.querySelector('[role="status"]')?.getAttribute('aria-live'),
  ).toBe('polite');
});
it('rejects missing tokens and invalid IDs before HTTP even outside the component', async () => {
  expect(await sendReportAssessment(reportId, 'validate', null)).toMatchObject({
    kind: 'error',
    requiresLogin: true,
  });
  expect(
    await sendReportAssessment('../other', 'validate', 'token'),
  ).toMatchObject({ kind: 'error', requiresLogin: false });
  expect(fetcher).not.toHaveBeenCalled();
});

it('keeps the real search, pagination and credibility states intact when assessing a card', async () => {
  const row = (id: string) => ({
    id,
    title: 'Reporte ' + id,
    description: 'Descripción del reporte',
    pattern_type: null,
    target_url: 'https://example.test/',
    page_key: 'https://example.test/',
    created_at: '2026-11-20T12:00:00Z',
    credibility: null,
  });
  const pageOne = { items: [row(reportId)], nextCursor: 'next-page' };
  const pageTwo = {
    items: [
      {
        ...row(otherReport),
        credibility: {
          score: 50,
          level: 'medium',
          sufficientData: false,
          updatedAt: '2026-11-20T12:00:00Z',
        },
      },
    ],
    nextCursor: null,
  };
  fetcher.mockImplementation(async (url, options) => {
    if (options.method === 'POST')
      return Response.json(receipt(), { status: 201 });
    return Response.json(String(url).includes('cursor=') ? pageTwo : pageOne);
  });
  await act(async () =>
    root.render(createElement(AuthProvider, null, createElement(Dashboard))),
  );
  await authenticate(null);
  const input = container.querySelector<HTMLInputElement>('#query')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, 'https://example.test/');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    input
      .closest('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(buttons().every((button) => button.disabled)).toBe(true);
  await authenticate();
  const more = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Cargar más',
  )!;
  await act(async () => more.click());
  expect(container.querySelectorAll('article')).toHaveLength(2);
  expect(container.textContent).toContain('Datos insuficientes');
  expect(container.textContent).toContain('Credibilidad no disponible');
  expect(fetcher.mock.calls[1]?.[0]).toContain('cursor=next-page');
  await click();
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(container.querySelectorAll('article')).toHaveLength(2);
  expect(input.value).toBe('https://example.test/');
  expect(container.querySelector(`#report-${reportId}`)?.textContent).toContain(
    'Validación registrada.',
  );
  expect(
    container.querySelector(`#report-${otherReport}`)?.textContent,
  ).not.toContain('registrada.');
  expect(container.textContent).toContain('Datos insuficientes');
});
