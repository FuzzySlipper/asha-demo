import { createReadStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiStatus } from './ui-status.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'dist/ui');
const authoredContentRoots = new Map([
  ['/catalogs/', join(appRoot, 'catalogs')],
  ['/game-rules/', join(appRoot, 'game-rules')],
  ['/levels/', join(appRoot, 'levels')],
  ['/project/', join(appRoot, 'project')],
]);
const vendorRoot = join(appRoot, 'vendor');
const catalogCoreBrowserRoot = join(vendorRoot, 'asha-catalog-core');
const contractsBrowserRoot = join(vendorRoot, 'asha-contracts');
const renderProjectionBrowserRoot = join(vendorRoot, 'asha-render-projection');
const rendererHostBrowserRoot = join(vendorRoot, 'asha-renderer-host');
const rendererHostBackendBrowserRoot = join(rendererHostBrowserRoot, 'vendor/asha-renderer-three');
const runtimeBridgeBrowserRoot = join(vendorRoot, 'asha-runtime-bridge');
const runtimeSessionBrowserRoot = join(vendorRoot, 'asha-runtime-session');
const rendererHostThreeBrowserRoot = join(rendererHostBrowserRoot, 'vendor/three');
const args = parseArgs(process.argv.slice(2));
const host = args.host ?? process.env.HOST ?? process.env.npm_config_host ?? '127.0.0.1';
const port = Number(args.port ?? process.env.PORT ?? process.env.npm_config_port ?? 5173);

runStaticUiBuild();

const server = createServer(async (request, response) => {
  response.setHeader('X-Den-Project', 'asha-demo');
  if (request.url === '/health') {
    sendJson(response, 200, { ok: true, project: 'asha-demo' });
    return;
  }
  if (request.url === '/api/status') {
    sendJson(response, 200, buildUiStatus(repoRoot));
    return;
  }
  if (request.url?.startsWith('/vendor/asha-catalog-core/')) {
    const vendorPath = request.url.replace('/vendor/asha-catalog-core/', '') || 'index.js';
    await sendStaticAssetFromRoot(response, catalogCoreBrowserRoot, vendorPath);
    return;
  }
  if (request.url?.startsWith('/vendor/asha-runtime-bridge/')) {
    const vendorPath = request.url.replace('/vendor/asha-runtime-bridge/', '') || 'browser.js';
    await sendStaticAssetFromRoot(response, runtimeBridgeBrowserRoot, vendorPath);
    return;
  }
  if (request.url?.startsWith('/vendor/asha-runtime-session/')) {
    const vendorPath = request.url.replace('/vendor/asha-runtime-session/', '') || 'index.js';
    await sendStaticAssetFromRoot(response, runtimeSessionBrowserRoot, vendorPath);
    return;
  }
  if (request.url?.startsWith('/vendor/asha-renderer-host/vendor/asha-renderer-three/')) {
    const vendorPath = request.url.replace('/vendor/asha-renderer-host/vendor/asha-renderer-three/', '') || 'index.js';
    await sendStaticAssetFromRoot(response, rendererHostBackendBrowserRoot, vendorPath);
    return;
  }
  if (request.url?.startsWith('/vendor/asha-render-projection/')) {
    const vendorPath = request.url.replace('/vendor/asha-render-projection/', '') || 'index.js';
    await sendStaticAssetFromRoot(response, renderProjectionBrowserRoot, vendorPath);
    return;
  }
  if (request.url?.startsWith('/vendor/asha-renderer-host/vendor/three/')) {
    const vendorPath = request.url.replace('/vendor/asha-renderer-host/vendor/three/', '') || 'build/three.module.js';
    await sendStaticAssetFromRoot(response, rendererHostThreeBrowserRoot, vendorPath);
    return;
  }
  if (request.url?.startsWith('/vendor/asha-renderer-host/')) {
    const vendorPath = request.url.replace('/vendor/asha-renderer-host/', '') || 'index.js';
    await sendStaticAssetFromRoot(response, rendererHostBrowserRoot, vendorPath);
    return;
  }
  if (request.url?.startsWith('/vendor/asha-contracts/')) {
    const vendorPath = request.url.replace('/vendor/asha-contracts/', '') || 'index.js';
    await sendStaticAssetFromRoot(response, contractsBrowserRoot, vendorPath);
    return;
  }
  for (const [prefix, root] of authoredContentRoots) {
    if (request.url?.startsWith(prefix)) {
      const contentPath = request.url.replace(prefix, '');
      await sendStaticAssetFromRoot(response, root, contentPath);
      return;
    }
  }

  const assetPath = request.url === '/' ? '/index.html' : decodeURIComponent(request.url ?? '/index.html');
  await sendStaticAssetFromRoot(response, appRoot, assetPath);
});

server.listen(port, host, () => {
  const address = server.address();
  const selectedPort = typeof address === 'object' && address !== null ? address.port : port;
  console.log(`asha-demo UI listening at http://${host}:${selectedPort}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

async function sendStaticAssetFromRoot(response, root, requestPath) {
  const normalizedPath = requestPath.replace(/^\/+/, '');
  const filePath = resolve(root, normalizedPath);
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error('not a file');
    }
    response.writeHead(200, { 'Content-Type': contentType(filePath) });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.toml':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--host') {
      parsed.host = argv[index + 1];
      index += 1;
    } else if (arg === '--port') {
      parsed.port = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function runStaticUiBuild() {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
