import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiStatus } from './ui-status.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const status = buildUiStatus(repoRoot);

console.log(JSON.stringify(status, null, 2));
