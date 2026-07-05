import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiStatus } from './ui-status.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'app');
const authoredContentRoots = new Map([
  ['/catalogs/', join(repoRoot, 'catalogs')],
  ['/levels/', join(repoRoot, 'levels')],
  ['/project/', join(repoRoot, 'project')],
]);
const catalogCoreBrowserRoot = join(repoRoot, 'node_modules', '@asha', 'catalog-core', 'dist');
const contractsBrowserRoot = join(repoRoot, 'node_modules', '@asha', 'contracts', 'dist');
const renderProjectionBrowserRoot = join(repoRoot, 'node_modules', '@asha', 'render-projection', 'dist');
const rendererThreeBrowserRoot = join(repoRoot, 'node_modules', '@asha', 'renderer-three', 'dist');
const runtimeBridgeBrowserRoot = join(repoRoot, 'node_modules', '@asha', 'runtime-bridge', 'dist');
const threeBrowserRoot = join(repoRoot, 'node_modules', 'three');
const args = parseArgs(process.argv.slice(2));
const host = args.host ?? process.env.HOST ?? process.env.npm_config_host ?? '127.0.0.1';
const port = Number(args.port ?? process.env.PORT ?? process.env.npm_config_port ?? 5173);

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
  if (request.url?.startsWith('/vendor/asha-renderer-three/')) {
    const vendorPath = request.url.replace('/vendor/asha-renderer-three/', '') || 'index.js';
    await sendStaticAssetFromRoot(response, rendererThreeBrowserRoot, vendorPath);
    return;
  }
  if (request.url?.startsWith('/vendor/asha-render-projection/')) {
    const vendorPath = request.url.replace('/vendor/asha-render-projection/', '') || 'index.js';
    await sendStaticAssetFromRoot(response, renderProjectionBrowserRoot, vendorPath);
    return;
  }
  if (request.url?.startsWith('/vendor/three/')) {
    const vendorPath = request.url.replace('/vendor/three/', '') || 'build/three.module.js';
    await sendStaticAssetFromRoot(response, threeBrowserRoot, vendorPath);
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
