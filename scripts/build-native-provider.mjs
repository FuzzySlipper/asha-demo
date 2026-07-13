import { copyFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync('cargo', [
  'build',
  '--manifest-path',
  'demo-rs/Cargo.toml',
  '--package',
  'asha-demo-native-runtime-provider',
  '--release',
], {
  cwd: repoRoot,
  stdio: 'inherit',
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const source = join(repoRoot, 'demo-rs/target/release/libasha_demo_native_runtime_provider.so');
const outputRoot = join(repoRoot, 'dist/native');
const destination = join(outputRoot, 'asha-demo-runtime-provider.node');
const temporary = `${destination}.tmp-${process.pid}`;
mkdirSync(outputRoot, { recursive: true });
rmSync(temporary, { force: true });
copyFileSync(source, temporary);
renameSync(temporary, destination);
console.log(`Built ASHA Demo composed RuntimeSession provider at ${destination}`);
