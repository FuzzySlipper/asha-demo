import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guardScriptPath = fileURLToPath(import.meta.url);
const engineSurfaceManifestPath = resolve(repoRoot, '../asha/harness/public-surface/ts-packages.json');

const allowedPackageRoots = loadAllowedAshaPackageRoots(engineSurfaceManifestPath);
const dependencySections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const scannedExtensions = new Set(['.cjs', '.cts', '.js', '.json', '.jsx', '.mjs', '.mts', '.toml', '.ts', '.tsx']);
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules']);
const errors = [];

checkPackageJson();
scanRepoFiles(repoRoot);

if (errors.length > 0) {
  console.error('ASHA dependency boundary check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`ASHA dependency boundary check passed (${allowedPackageRoots.size} approved package roots loaded).`);

function loadAllowedAshaPackageRoots(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const roots = new Set();
  for (const entry of manifest.packages ?? []) {
    const roles = Array.isArray(entry.allowedConsumerRoles) ? entry.allowedConsumerRoles : [];
    if (entry.status !== 'internal' && roles.includes('asha-demo')) {
      roots.add(entry.package);
    }
  }
  return roots;
}

function checkPackageJson() {
  const packageJsonPath = join(repoRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  for (const section of dependencySections) {
    const dependencies = packageJson[section] ?? {};
    for (const dependencyName of Object.keys(dependencies)) {
      if (!dependencyName.startsWith('@asha/')) {
        continue;
      }
      if (!allowedPackageRoots.has(dependencyName)) {
        errors.push(`${section}.${dependencyName} is not approved for asha-demo by ${engineSurfaceManifestPath}`);
      }
    }
  }
}

function scanRepoFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        scanRepoFiles(join(directory, entry.name));
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const filePath = join(directory, entry.name);
    if (filePath === guardScriptPath) {
      continue;
    }
    if (!scannedExtensions.has(extname(entry.name))) {
      continue;
    }
    checkTextFile(filePath, readFileSync(filePath, 'utf8'));
  }
}

function checkTextFile(filePath, text) {
  const displayPath = relative(repoRoot, filePath).split(sep).join('/');
  const ashaReferences = text.match(/@asha\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_./-]+)?/g) ?? [];
  for (const reference of ashaReferences) {
    const packageRoot = reference.split('/').slice(0, 2).join('/');
    if (!allowedPackageRoots.has(packageRoot)) {
      errors.push(`${displayPath} references ${reference}, which is not approved for asha-demo`);
      continue;
    }
    if (reference !== packageRoot) {
      errors.push(`${displayPath} references ${reference}; import ASHA packages from root exports only`);
    }
  }

  const forbiddenPathPatterns = [
    /\.\.\/asha\/engine-rs\b/,
    /\.\.\/asha\/ts\/packages\/[^"'\s]+\/src\b/,
    /\bengine-rs\/crates\b/,
    /\bts\/packages\/contracts\/src\/generated\b/,
    /\bcontracts\/src\/generated\b/,
    /\bdist\/generated\b/,
    /\bsrc\/generated\b/,
  ];
  for (const pattern of forbiddenPathPatterns) {
    if (pattern.test(text)) {
      errors.push(`${displayPath} contains forbidden ASHA internal/generated path pattern ${pattern}`);
    }
  }
}
