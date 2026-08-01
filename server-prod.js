import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const requestedPort = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const publicDir = path.join(__dirname, '.output', 'public');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

const listenOnPort = (port) => {
  const server = http.createServer((req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname === '/') pathname = '/index.html';
    if (pathname.includes('..')) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const filePath = path.join(publicDir, pathname.replace(/^\//, ''));
    const resolvedPath = path.resolve(filePath);
    const allowedRoot = path.resolve(publicDir);
    if (!resolvedPath.startsWith(allowedRoot)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    if (!existsSync(resolvedPath)) {
      const fallbackPath = path.join(publicDir, 'index.html');
      if (existsSync(fallbackPath)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        createReadStream(fallbackPath).pipe(res);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    res.writeHead(200, { 'content-type': mimeTypes[ext] || 'application/octet-stream' });
    createReadStream(resolvedPath).pipe(res);
  } catch {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Internal server error');
    }
  });

  server.on('error', (error) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
      const fallbackPort = port + 1;
      console.warn(`Port ${port} already in use, trying ${fallbackPort}`);
      listenOnPort(fallbackPort);
      return;
    }
    throw error;
  });

  server.listen(port, host, () => {
    console.log(`Production server listening on http://${host}:${port}`);
  });
};

listenOnPort(requestedPort);
