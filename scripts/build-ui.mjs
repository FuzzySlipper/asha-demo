import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiStatus } from './ui-status.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(repoRoot, 'dist/ui');

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(outputRoot, { recursive: true });
cpSync(join(repoRoot, 'app'), outputRoot, { recursive: true });
writeFileSync(join(outputRoot, 'status.json'), `${JSON.stringify(buildUiStatus(repoRoot), null, 2)}\n`);

console.log(`Built ASHA demo static UI at ${outputRoot}`);
