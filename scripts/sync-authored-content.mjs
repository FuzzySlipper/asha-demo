import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const manifestPath = join(repoRoot, 'asha.project-bundle.json');
const behaviorPath = 'catalogs/gameplay/security-door.behavior.json';
const gameplayCatalogPath = 'catalogs/gameplay/catalog.json';
const generatedModulePath = join(repoRoot, 'dist/ui/content/security-door.js');

if (!existsSync(generatedModulePath)) {
  throw new Error('Compile the Demo TypeScript before checking authored content.');
}

const moduleUrl = `${pathToFileURL(generatedModulePath).href}?sync=${Date.now()}`;
const { securityDoorBehaviorDocument } = await import(moduleUrl);
const expectedBehavior = {
  schemaVersion: 1,
  documentId: securityDoorBehaviorDocument.documentId,
  documentKind: 'behaviorPackage',
  document: securityDoorBehaviorDocument.package,
};

if (write) {
  writeFileSync(
    join(repoRoot, behaviorPath),
    `${JSON.stringify(expectedBehavior, null, 2)}\n`,
  );
} else {
  const actualBehavior = JSON.parse(readFileSync(join(repoRoot, behaviorPath), 'utf8'));
  if (JSON.stringify(actualBehavior) !== JSON.stringify(expectedBehavior)) {
    throw new Error(
      `Committed ${behaviorPath} does not match the public TypeScript declaration; run npm run sync:content.`,
    );
  }
}

const linkedContract = readLinkedContract();
const actualGameplayCatalog = JSON.parse(
  readFileSync(join(repoRoot, gameplayCatalogPath), 'utf8'),
);
const linkedModules = new Map([
  [linkedContract.module.moduleId, linkedContract.module],
  [linkedContract.launchSettingsModule.moduleId, linkedContract.launchSettingsModule],
]);
const expectedGameplayCatalog = {
  ...actualGameplayCatalog,
  document: {
    ...actualGameplayCatalog.document,
    configurations: actualGameplayCatalog.document.configurations.map((configuration) => ({
      ...configuration,
      module: linkedModules.get(configuration.module.moduleId) ?? configuration.module,
    })),
  },
};
if (write) {
  writeFileSync(
    join(repoRoot, gameplayCatalogPath),
    `${JSON.stringify(expectedGameplayCatalog, null, 2)}\n`,
  );
} else if (JSON.stringify(actualGameplayCatalog) !== JSON.stringify(expectedGameplayCatalog)) {
  throw new Error(
    `Committed ${gameplayCatalogPath} does not match the linked Rust providers; run npm run sync:content.`,
  );
}

const requiredArtifacts = new Map([
  ['assets/mesh-static/security-door.gltf', 'resource:animatedMesh'],
  ['assets/mesh-static/security-switch.gltf', 'resource:animatedMesh'],
  ['catalogs/actors/security-door.entity.json', 'projectContent'],
  ['catalogs/actors/security-switch.entity.json', 'projectContent'],
  [behaviorPath, 'projectContent'],
  ['catalogs/prefabs/security-switch.prefab.json', 'prefabRegistry'],
]);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const artifactsByPath = new Map(manifest.artifacts.map((artifact) => [artifact.path, artifact]));
for (const [path, role] of requiredArtifacts) {
  const existing = artifactsByPath.get(path);
  artifactsByPath.set(path, existing ?? { path, class: 'durable', role, contentHash: '' });
}

const artifacts = [...artifactsByPath.values()]
  .sort((left, right) => left.path.localeCompare(right.path))
  .map((artifact) => ({
    ...artifact,
    contentHash: fnv1a64(readFileSync(join(repoRoot, artifact.path))),
  }));
const assetLock = JSON.parse(
  readFileSync(join(repoRoot, manifest.assetLock.artifact), 'utf8'),
);
const expectedManifest = {
  ...manifest,
  assetLock: {
    ...manifest.assetLock,
    assetCount: assetLock.entries.length,
  },
  artifacts,
};

if (write) {
  writeFileSync(manifestPath, `${JSON.stringify(expectedManifest, null, 2)}\n`);
} else if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) {
  throw new Error('ProjectBundle artifact closure or hashes are stale; run npm run sync:content.');
}

console.log(
  write
    ? `Synchronized authored content and ${artifacts.length} ProjectBundle hashes.`
    : `Authored TypeScript, stored content, and ${artifacts.length} ProjectBundle hashes agree.`,
);

function fnv1a64(bytes) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function readLinkedContract() {
  const result = spawnSync(
    'cargo',
    [
      'run',
      '-q',
      '--manifest-path',
      'demo-rs/Cargo.toml',
      '--bin',
      'asha-demo-preflight',
      '--',
      '--print-linked-contract',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `Could not derive linked Rust provider identities: ${result.stderr || result.stdout}`,
    );
  }
  return JSON.parse(result.stdout);
}
