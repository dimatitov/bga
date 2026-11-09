/**
 * SWR-005B defect D-1 (AC-10, AC-13): first Vitest `setupFiles` entry — runs in every test worker before any test
 * module (and so before `@prisma/client`) is imported. Prisma's own dotenv loader copies every variable of
 * apps/api/.env that is not already present into process.env (at import and on `new PrismaClient`); dotenv never
 * overwrites a present key, even an empty one. So every OPENAI_* variable is set here: blank (= unset for our config)
 * and OPENAI_ENABLED=false — the PO's real key and model names never enter a test process.
 */
import { BLANKED_OPENAI_VARS } from '../../scripts/e2e-env.mjs';

for (const key of Object.keys(process.env)) {
  if (/^OPENAI_/.test(key)) process.env[key] = '';
}
for (const key of BLANKED_OPENAI_VARS) process.env[key] = '';
process.env.OPENAI_ENABLED = 'false';
