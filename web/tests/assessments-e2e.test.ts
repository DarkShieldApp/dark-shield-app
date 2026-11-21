import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { POST } from '../src/app/api/reports/[reportId]/assessments/route';
import { getReportsCredibility } from '../src/server/credibility';

vi.mock('server-only', () => ({}));

const reportId = randomUUID();
let authorId = '';
let assessorId = '';
let weakAssessorId = '';
const suffix = randomUUID();
const password = `T8-${randomUUID()}-Aa9!`;
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!baseUrl || !anonKey || !serviceRoleKey) {
  throw new Error('Ejecuta esta suite con `npm run test:assessments:e2e`.');
}

const admin = createClient(baseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicAuth = createClient(baseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const tokens = new Map<string, string>();
const createdUsers: string[] = [];
let fixtureSetup = false;

function queryDatabase(sql: string) {
  const sqlFile = path.join(tmpdir(), `darkshield-hu08-t8-${randomUUID()}.sql`);
  writeFileSync(sqlFile, sql, { encoding: 'utf8', flag: 'wx' });
  try {
    const result = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['--no-install', 'supabase', 'db', 'query', '--local', '--file', sqlFile],
      {
        cwd: path.resolve(process.cwd(), '..'),
        encoding: 'utf8',
        windowsHide: true,
        shell: process.platform === 'win32',
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`No se pudo preparar la fixture SQL: ${result.stderr}`);
    }
  } finally {
    rmSync(sqlFile, { force: true });
  }
}

async function createUser(label: string) {
  const email = `hu08-t8-${label}-${suffix}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw error ?? new Error('Supabase no creó el usuario fixture.');
  createdUsers.push(data.user.id);
  const { data: session, error: signInError } =
    await publicAuth.auth.signInWithPassword({
      email,
      password,
    });
  if (signInError || !session.session) {
    throw (
      signInError ??
      new Error('Supabase no emitió token para el usuario fixture.')
    );
  }
  tokens.set(label, session.session.access_token);
  return data.user.id;
}

function request(report: string, token?: string, action: unknown = 'validate') {
  return POST(
    new Request(`http://localhost/api/reports/${report}/assessments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action }),
    }),
    { params: Promise.resolve({ reportId: report }) },
  );
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ error: { code } });
}

describe('HU-08/T8: proceso real de valoración con Supabase local', () => {
  beforeAll(async () => {
    authorId = await createUser('author');
    assessorId = await createUser('assessor');
    weakAssessorId = await createUser('weak');

    queryDatabase(`do $setup$
      begin
        if exists (select 1 from private.assessment_policy where minimum_trust_level is not null) then
          raise exception 'HU-08/T8 requiere una instancia local aislada con política sin configurar';
        end if;

      update public.profiles set trust_level = 80 where id = '${assessorId}';
      update public.profiles set trust_level = 20 where id = '${weakAssessorId}';
      insert into public.reports
        (id, author_id, title, description, target_url, page_key, target_host, registrable_domain)
      values
        ('${reportId}', '${authorId}', 'HU-08/T8 fixture', 'Fixture E2E temporal',
         'https://example.test/', 'https://example.test/', 'example.test', 'example.test');
      update private.assessment_policy set minimum_trust_level = 40 where singleton;
      end;
    $setup$;`);
    fixtureSetup = true;
  }, 60_000);

  afterAll(async () => {
    // Test only targets random IDs in an isolated local Supabase database.
    if (createdUsers.length > 0)
      queryDatabase(`do $cleanup$
      begin
        delete from public.report_assessments where report_id = '${reportId}';
        delete from public.reports where id = '${reportId}';
        delete from public.profiles where id in (${createdUsers.map((id) => `'${id}'`).join(',')});
        delete from auth.users where id in (${createdUsers.map((id) => `'${id}'`).join(',')});
      ${fixtureSetup ? 'update private.assessment_policy set minimum_trust_level = null where singleton;' : ''}
      end;
    $cleanup$;`);
  }, 60_000);

  it('guarda el recibo, refleja la última valoración en credibilidad y protege el flujo', async () => {
    await expectError(await request(reportId), 401, 'UNAUTHENTICATED');
    await expectError(
      await request(reportId, tokens.get('assessor'), 'approve'),
      400,
      'INVALID_INPUT',
    );

    const first = await request(reportId, tokens.get('assessor'), 'validate');
    expect(first.status).toBe(201);
    const firstReceipt = await first.json();
    expect(firstReceipt).toMatchObject({ reportId, action: 'validate' });
    expect(Object.keys(firstReceipt).sort()).toEqual(
      ['action', 'createdAt', 'id', 'reportId'].sort(),
    );

    const client: SupabaseClient = createClient(baseUrl, anonKey, {
      global: {
        headers: { Authorization: `Bearer ${tokens.get('assessor')}` },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const firstCredibility = await getReportsCredibility([reportId], {
      client,
    });
    expect(firstCredibility.get(reportId)?.factors).toMatchObject({
      validations: 80,
      invalidations: 0,
    });

    const second = await request(
      reportId,
      tokens.get('assessor'),
      'invalidate',
    );
    expect(second.status).toBe(201);
    const secondReceipt = await second.json();
    expect(secondReceipt.id).not.toBe(firstReceipt.id);
    const latestCredibility = await getReportsCredibility([reportId], {
      client,
    });
    expect(latestCredibility.get(reportId)?.factors).toMatchObject({
      validations: 0,
      invalidations: 80,
    });

    await expectError(
      await request(reportId, tokens.get('author')),
      403,
      'OWN_REPORT',
    );
    await expectError(
      await request(reportId, tokens.get('weak')),
      403,
      'FORBIDDEN',
    );
    await expectError(
      await request(
        '00000000-0000-4000-8000-000000000001',
        tokens.get('assessor'),
      ),
      404,
      'REPORT_NOT_FOUND',
    );
  });
});
