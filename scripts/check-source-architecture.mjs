import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(repoRoot, 'src');
const appRoot = join(repoRoot, 'app');
const errors = [];

runNegativeFixtureSelfTests();
checkEntrypoint();
checkNoHandwrittenSourceJavaScript();
checkSourceImports();
checkRuntimeDomProjectionMixing();

if (errors.length > 0) {
  console.error('ASHA demo source architecture check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('ASHA demo source architecture check passed.');

function checkEntrypoint() {
  const appPath = join(sourceRoot, 'app.ts');
  const text = readFileSync(appPath, 'utf8');
  const analysis = analyzeEntrypoint(text);
  for (const error of analysis) {
    errors.push(`src/app.ts ${error}`);
  }
}

function checkNoHandwrittenSourceJavaScript() {
  const jsSourceFiles = [
    ...listFiles(sourceRoot).filter((path) => path.endsWith('.js')),
    ...listFiles(appRoot).filter((path) => path.endsWith('.js')),
  ];
  for (const filePath of jsSourceFiles) {
    errors.push(`${relative(repoRoot, filePath)} is handwritten source JavaScript; use TypeScript source or generated dist output`);
  }
}

function checkSourceImports() {
  const allowedAshaPackageRoots = new Set(Object.keys(readPackageJson().dependencies ?? {}));
  for (const filePath of listFiles(sourceRoot).filter((path) => path.endsWith('.ts'))) {
    const text = readFileSync(filePath, 'utf8');
    const relativePath = relative(repoRoot, filePath);
    for (const specifier of readImportSpecifiers(text)) {
      if (specifier === 'three' || specifier.startsWith('three/')) {
        errors.push(`${relativePath} imports Three.js directly; use @asha/renderer-host`);
      }
      if (specifier === '@asha/renderer-three' || specifier.startsWith('@asha/renderer-three/')) {
        errors.push(`${relativePath} imports renderer backend directly; use @asha/renderer-host`);
      }
      if (specifier.startsWith('@asha/') && !allowedAshaPackageRoots.has(specifier)) {
        errors.push(`${relativePath} imports ${specifier}; demo source may import approved ASHA package roots only`);
      }
      if (specifier.includes('/src/') || specifier.includes('/generated/') || specifier.includes('/dist/')) {
        errors.push(`${relativePath} imports private/generated path ${specifier}`);
      }
    }
  }
}

function checkRuntimeDomProjectionMixing() {
  for (const filePath of listFiles(sourceRoot).filter((path) => path.endsWith('.ts'))) {
    const relativePath = relative(repoRoot, filePath);
    const text = readFileSync(filePath, 'utf8');
    const analysis = analyzeRuntimeDomMixing(relativePath, text);
    for (const error of analysis) {
      errors.push(error);
    }
  }
}

function analyzeEntrypoint(text) {
  const localErrors = [];
  const meaningfulLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));
  const forbiddenEntrypointTerms = [
    'document.',
    'window.',
    'querySelector',
    'addEventListener',
    'RuntimeSession',
    'createRuntimeSession',
    'mountAshaRendererSurface',
    'TINY_GENERATED_TUNNEL_READOUT',
    'hudControlToIntent',
  ];
  if (meaningfulLines.length > 8) {
    localErrors.push('must stay a thin entrypoint with no app logic');
  }
  if (!text.includes("import { bootGame } from './bootstrap/boot-game.js';")) {
    localErrors.push('must import bootGame from the bootstrap boundary');
  }
  if (!text.includes('void bootGame().catch')) {
    localErrors.push('must only call bootGame and report fatal startup errors');
  }
  for (const term of forbiddenEntrypointTerms) {
    if (text.includes(term)) {
      localErrors.push(`contains entrypoint-forbidden term ${term}`);
    }
  }
  return localErrors;
}

function analyzeRuntimeDomMixing(relativePath, text) {
  const runtimeTerms = [
    'createRuntimeSessionFacade',
    'resolveNativeRustRuntimeBridgeProvider',
    'submitRuntimeActionIntent',
    'requestSessionRestart',
    'applyCollisionConstrainedCameraInput',
    'readRuntimeSessionPlayableLoopState',
    'readRuntimeSessionPlayableEncounterTick',
    'runtimeGateway.submit',
    'runtimeGateway.request',
    'runtimeGateway.apply',
  ];
  const domProjectionTerms = [
    '.textContent',
    '.style.width',
    '.dataset.',
    '.hidden =',
    'document.querySelector',
  ];
  const runtimeTouched = runtimeTerms.some((term) => text.includes(term));
  const domProjectionTouched = domProjectionTerms.some((term) => text.includes(term));
  if (runtimeTouched && domProjectionTouched && !relativePath.startsWith('src/shell/')) {
    return [`${relativePath} mixes runtime request/read calls with direct DOM projection mutation`];
  }
  return [];
}

function runNegativeFixtureSelfTests() {
  assertSelfTestFails(
    'bloated app.ts fixture',
    () => analyzeEntrypoint("import { bootGame } from './bootstrap/boot-game.js';\ndocument.querySelector('#x');\nvoid bootGame().catch(console.error);\n"),
  );
  assertSelfTestFails(
    'runtime plus DOM fixture',
    () => analyzeRuntimeDomMixing('src/features/bad-feature.ts', 'runtimeGateway.requestSessionRestart({}); node.textContent = "bad";'),
  );
}

function assertSelfTestFails(name, fn) {
  if (fn().length === 0) {
    errors.push(`architecture checker self-test did not reject ${name}`);
  }
}

function readPackageJson() {
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
}

function readImportSpecifiers(text) {
  const specifiers = [];
  const importPattern = /\bfrom\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
  let match = importPattern.exec(text);
  while (match !== null) {
    specifiers.push(match[1] ?? match[2]);
    match = importPattern.exec(text);
  }
  return specifiers;
}

function listFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...listFiles(path));
    } else if (stats.isFile()) {
      files.push(path);
    }
  }
  return files;
}
