import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const root = path.resolve(workspace, '..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

// Keep local Supabase keys in memory and pass them only to the test process.
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const status = run(
  npx,
  ['--no-install', 'supabase', 'status', '--output', 'env'],
  { shell: process.platform === 'win32' },
);
const values = Object.fromEntries(
  status
    .split(/\r?\n/)
    .map((line) => line.match(/^(?:export\s+)?([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]),
);
const apiUrl = values.API_URL ?? values.SUPABASE_URL;
const publishableKey = values.PUBLISHABLE_KEY;
const serviceRoleKey = values.SERVICE_ROLE_KEY ?? values.SECRET_KEY;
if (!apiUrl || !publishableKey || !serviceRoleKey) {
  throw new Error(
    'Supabase local no proporcionó URL y claves para la prueba E2E.',
  );
}

run(
  process.execPath,
  [
    path.join(root, 'node_modules', 'vitest', 'vitest.mjs'),
    'run',
    '--config',
    path.join(workspace, 'vitest.assessments-e2e.config.ts'),
  ],
  {
    cwd: workspace,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      ASSESSMENTS_MIN_TRUST_LEVEL: '40',
    },
    stdio: 'inherit',
  },
);
