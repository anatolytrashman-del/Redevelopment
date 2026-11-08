/**
 * Отдача dist со сжатием (brotli, иначе gzip).
 * python http.server этого не делает, и лабораторный Lighthouse
 * тогда не сравним с продом.
 *
 *   node scripts/malllist-static-serve.mjs dist 4173
 */
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const root = normalize(process.argv[2] || 'dist');
const port = Number(process.argv[3] || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

function fileFor(urlPath) {
  const rel = decodeURIComponent(urlPath.split('?')[0]);
  let path = join(root, rel);
  if (rel.endsWith('/')) path = join(path, 'index.html');
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!existsSync(path)) return null;
  return path;
}

const server = createServer((req, res) => {
  const path = fileFor(req.url || '/');
  if (!path) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const body = readFileSync(path);
  const type = types[extname(path)] || 'application/octet-stream';
  const accept = String(req.headers['accept-encoding'] || '');
  const compressible = /text|javascript|json|svg|xml/.test(type);
  if (compressible && accept.includes('br')) {
    const encoded = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
    res.writeHead(200, { 'content-type': type, 'content-encoding': 'br', vary: 'accept-encoding' });
    res.end(encoded);
    return;
  }
  if (compressible && accept.includes('gzip')) {
    res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip', vary: 'accept-encoding' });
    res.end(gzipSync(body));
    return;
  }
  res.writeHead(200, { 'content-type': type });
  res.end(body);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[static] http://127.0.0.1:${port}  root=${root}  br/gzip`);
});
