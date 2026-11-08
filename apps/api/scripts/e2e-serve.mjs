// E2E API server (A-17): own SQLite file, own build dir (dist-e2e), own port — does not touch `pnpm dev`.
// Steps: fresh DB → prisma migrate deploy → tsc into dist-e2e → node dist-e2e/main.js.
// Workspace packages must be built beforehand (root `pnpm e2e` runs `build:packages`).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = join(apiRoot, '.tmp');
const dbFile = join(tmpDir, 'e2e.db');
const port = process.env.PORT ?? process.env.E2E_API_PORT ?? '3100';
const env = { ...process.env, DATABASE_URL: `file:${dbFile}`, PORT: port };

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: apiRoot, env, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[e2e-serve] failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

mkdirSync(tmpDir, { recursive: true });
for (const suffix of ['', '-journal']) rmSync(`${dbFile}${suffix}`, { force: true });

run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json', '--outDir', 'dist-e2e']);

console.log(`[e2e-serve] starting API on :${port} with ${dbFile}`);
const server = spawn(process.execPath, [join(apiRoot, 'dist-e2e', 'main.js')], {
  cwd: apiRoot,
  env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
