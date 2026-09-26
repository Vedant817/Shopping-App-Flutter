import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'build/web');
const port = Number(process.argv[3] ?? 5174);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.map': 'application/json; charset=utf-8',
  '.env': 'text/plain; charset=utf-8',
};

createServer((request, response) => {
  const requested = decodeURIComponent((request.url ?? '/').split('?')[0]);
  const relative = normalize(requested).replace(/^([/\\])+/, '');
  let filePath = join(root, relative);
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  // A release build ships a service worker that caches the hashed asset bundle.
  // After a rebuild the old worker keeps serving the previous JavaScript, which
  // mixes stale and current code and produces failures that look like
  // application bugs. This server exists to inspect a build, so the worker is
  // refused outright and every load is served from disk.
  if (relative === 'flutter_service_worker.js') {
    response.writeHead(404, { 'cache-control': 'no-store' }).end();
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, 'index.html');
  }
  response.writeHead(200, {
    'content-type': types[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
