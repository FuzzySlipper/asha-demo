import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(repoRoot, 'asha.project-bundle.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const errors = [];

if (manifest.bundleSchemaVersion !== 2 || manifest.protocolVersion !== 1) {
  errors.push('root ProjectBundle must use canonical schema v2 and protocol v1');
}
if (!Number.isSafeInteger(manifest.entryScene)) {
  errors.push('root ProjectBundle must select one numeric entry scene');
}
if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
  errors.push('root ProjectBundle must declare its complete stored source closure');
}

const seenPaths = new Set();
for (const artifact of manifest.artifacts ?? []) {
  if (seenPaths.has(artifact.path)) errors.push(`duplicate manifest artifact path: ${artifact.path}`);
  seenPaths.add(artifact.path);
  const absolutePath = join(repoRoot, artifact.path);
  if (!existsSync(absolutePath)) {
    errors.push(`missing manifest artifact: ${artifact.path}`);
    continue;
  }
  const actualHash = fnv1a64(readFileSync(absolutePath));
  if (actualHash !== artifact.contentHash) {
    errors.push(`stale artifact hash for ${artifact.path}: ${artifact.contentHash} != ${actualHash}`);
  }
}

const entryScene = manifest.scenes?.find((scene) => scene.id === manifest.entryScene);
if (entryScene === undefined || !seenPaths.has(entryScene.artifact)) {
  errors.push('entry scene must resolve through the manifest artifact closure');
}
for (const removedPath of [
  'project/project-bundle.json',
  'src/content/project-source.ts',
  'src/content/prefab-authoring.ts',
]) {
  if (existsSync(join(repoRoot, removedPath))) {
    errors.push(`removed parallel content path is still present: ${removedPath}`);
  }
}

if (errors.length > 0) {
  console.error('ASHA demo canonical content boundary check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`ASHA demo canonical content boundary check passed (${seenPaths.size} artifacts).`);

function fnv1a64(bytes) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
