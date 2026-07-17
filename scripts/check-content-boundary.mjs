import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadDemoProjectContent,
  readDemoProjectContentStatus,
} from '../dist/ui/content/project-content.js';
import { decodeDemoProjectBundle } from '../dist/ui/content/project-source.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectBundlePath = '/project/project-bundle.json';
const prefabRegistryPath = '/prefabs/registry.json';

await assertTypedBoundaryHasNoAny();
const healthyContent = await loadDemoProjectContent(readProjectJson, readProjectText);
assert.equal(readDemoProjectContentStatus(healthyContent).valid, true);
assert.equal(
  healthyContent.sceneDocumentSourceText,
  await readProjectText(`/${healthyContent.sourceFiles.sceneDocument}`),
);
assert.deepEqual(
  healthyContent.sceneDocument.nodes
    .filter((node) => node.kind.kind === 'entityInstance')
    .map((node) => node.kind.instance.reference.kind === 'entityDefinition'
      ? node.kind.instance.reference.stableId
      : `prefab:${node.kind.instance.reference.prefabId}`),
  ['actor/demo-player', 'actor/generated-tunnel-enemy'],
);

const sourceReferenceFixture = await readFixture('project-bundle.invalid-source-reference.json');
const healthyBundle = await readProjectJson(projectBundlePath);
assert.equal(isObject(healthyBundle), true);
assert.equal(isObject(sourceReferenceFixture), true);
assertCompositionMigrationBoundary(healthyBundle);
const sourceReferenceFiles = requireObject(sourceReferenceFixture.sourceFiles, 'fixture.sourceFiles');
const invalidSourceBundle = {
  ...healthyBundle,
  sourceFiles: {
    ...requireObject(healthyBundle.sourceFiles, 'projectBundle.sourceFiles'),
    ...sourceReferenceFiles,
  },
};
const sourceRequests = [];
await assert.rejects(
  loadDemoProjectContent(async (path) => {
    sourceRequests.push(path);
    return path === projectBundlePath ? invalidSourceBundle : readProjectJson(path);
  }),
  /\$\.sourceFiles\.prefabRegistry: expected a bounded project-relative source path/u,
);
assert.deepEqual(sourceRequests, [projectBundlePath]);

await assertPrefabFixtureFails(
  'prefab-registry.invalid-schema.json',
  /unsupportedRegistrySchema:schemaVersion/u,
);
await assertPrefabFixtureFails(
  'prefab-registry.invalid-variant-role.json',
  /invalidOverrideTarget:prefab\[71\]\.variant\.overrides\[0\]\.targetRole, unknownRemovedRole:prefab\[71\]\.variant\.removedRoles\[0\]/u,
);
await assertPrefabFixtureFails(
  'prefab-registry.invalid-dangling-role.json',
  /danglingPartRole:definitions\[0\]\.partRoles\[0\]\.part/u,
);

console.log('ASHA demo typed content boundary check passed.');

function assertCompositionMigrationBoundary(projectBundle) {
  const legacyBundle = structuredClone(projectBundle);
  const legacyRuntime = requireObject(legacyBundle.gameplayRuntime, 'legacy.gameplayRuntime');
  delete legacyRuntime.compositionRequirement;
  legacyRuntime.compositionHash = 'fnv1a64:b0ff59982863a494';
  const decodedLegacy = decodeDemoProjectBundle(legacyBundle);
  assert.equal(decodedLegacy.gameplayRuntime.compositionRequirement, undefined);
  assert.equal(
    decodedLegacy.gameplayRuntime.legacyCompositionHash,
    'fnv1a64:b0ff59982863a494',
  );

  const exactBundle = structuredClone(projectBundle);
  const exactRuntime = requireObject(exactBundle.gameplayRuntime, 'exact.gameplayRuntime');
  const exactRequirement = requireObject(
    exactRuntime.compositionRequirement,
    'exact.gameplayRuntime.compositionRequirement',
  );
  exactRequirement.loadMode = 'exact';
  assert.equal(
    decodeDemoProjectBundle(exactBundle).gameplayRuntime.compositionRequirement?.loadMode,
    'exact',
  );

  const ambiguousBundle = structuredClone(projectBundle);
  const ambiguousRuntime = requireObject(
    ambiguousBundle.gameplayRuntime,
    'ambiguous.gameplayRuntime',
  );
  ambiguousRuntime.compositionHash = 'fnv1a64:b0ff59982863a494';
  assert.throws(
    () => decodeDemoProjectBundle(ambiguousBundle),
    /compositionRequirement and legacy compositionHash cannot both be present/u,
  );
}

async function assertPrefabFixtureFails(name, expected) {
  const invalidPrefab = await readFixture(name);
  await assert.rejects(
    loadDemoProjectContent((path) => path === prefabRegistryPath
      ? Promise.resolve(invalidPrefab)
      : readProjectJson(path)),
    expected,
  );
}

async function readFixture(name) {
  return JSON.parse(await readFile(join(repoRoot, 'fixtures/project-content', name), 'utf8'));
}

async function readProjectJson(path) {
  return JSON.parse(await readProjectText(path));
}

async function readProjectText(path) {
  const relativePath = path.startsWith('/') ? path.slice(1) : path;
  if (relativePath.split('/').includes('..')) {
    throw new Error(`Fixture reader rejected traversal path ${path}`);
  }
  return readFile(join(repoRoot, relativePath), 'utf8');
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value, path) {
  if (!isObject(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value;
}

async function assertTypedBoundaryHasNoAny() {
  for (const directory of ['src/content', 'src/runtime']) {
    const entries = await readdir(join(repoRoot, directory), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) {
        continue;
      }
      const path = join(repoRoot, directory, entry.name);
      const source = await readFile(path, 'utf8');
      assert.equal(/\bany\b/u.test(source), false, `${directory}/${entry.name} must not contain any`);
    }
  }
}
