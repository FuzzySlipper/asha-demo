import { createReadStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'dist/ui');
const args = parseArgs(process.argv.slice(2));
const host = args.host ?? process.env.HOST ?? process.env.npm_config_host ?? '0.0.0.0';
const port = Number(args.port ?? process.env.PORT ?? process.env.npm_config_port ?? 5173);

runStaticUiBuild();

const server = createServer(async (request, response) => {
  response.setHeader('X-Den-Project', 'asha-demo');
  if (request.url === '/health') {
    sendJson(response, 200, { ok: true, project: 'asha-demo' });
    return;
  }
  if (request.url === '/api/status') {
    await sendStaticAssetFromRoot(response, appRoot, '/api/status');
    return;
  }

  const assetPath = request.url === '/' ? '/index.html' : decodeURIComponent(request.url ?? '/index.html');
  await sendStaticAssetFromRoot(response, appRoot, assetPath);
});

server.listen(port, host, () => {
  const address = server.address();
  const selectedPort = typeof address === 'object' && address !== null ? address.port : port;
  console.log(`asha-demo static fail-closed UI listening at http://${host}:${selectedPort}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

async function sendStaticAssetFromRoot(response, root, requestPath) {
  const normalizedPath = requestPath.replace(/^\/+/, '');
  const filePath = resolve(root, normalizedPath);
  if (!isPathInsideRoot(root, filePath)) {
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

function isPathInsideRoot(root, filePath) {
  const relativePath = relative(root, filePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
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
