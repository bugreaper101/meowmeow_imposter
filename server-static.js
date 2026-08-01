import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const docs = path.join(__dirname, '.output', 'public');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    const safePath = path.normalize(urlPath).replace(/^\/+/, '');
    const hasExtension = path.extname(urlPath) !== '';
    const filePath = path.join(docs, safePath || 'index.html');
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(docs))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    try {
      const data = await readFile(resolved);
      const ext = path.extname(resolved).toLowerCase();
      res.writeHead(200, { 'content-type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
      return;
    } catch {
      if (hasExtension || safePath === '') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const indexPath = path.join(docs, 'index.html');
      const indexData = await readFile(indexPath);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(indexData);
    }
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Static server listening on http://${host}:${port}`);
});
