import http from 'node:http';
import { readdirSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const docs = path.join(__dirname, '.output', 'public');
const assetsDir = path.join(docs, 'assets');

function buildIndexHtml() {
  const assets = existsSync(assetsDir)
    ? readdirSync(assetsDir).filter((file) => file.endsWith('.js') || file.endsWith('.css')).sort()
    : [];
  const css = assets.find((file) => file.endsWith('.css')) ?? '';
  const entry = assets.find((file) => file.startsWith('index-') && file.endsWith('.js')) ?? '';
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f5eef4" />
    <title>MeowMeow Imposter</title>
    <link rel="icon" href="/favicon.ico" />
    ${css ? `<link rel="stylesheet" href="/assets/${css}" />` : ''}
  </head>
  <body>
    <div id="root"></div>
    ${entry ? `<script type="module" src="/assets/${entry}"></script>` : ''}
  </body>
</html>`;
}

const startServer = () => {
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
      if (urlPath === '/health') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      const safePath = path.normalize(urlPath).replace(/^\/+/, '');
      const hasExtension = path.extname(urlPath) !== '';
      const filePath = path.join(docs, safePath || 'index.html');
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(docs))) {
        res.writeHead(403); res.end('Forbidden'); return;
      }

      try {
        const data = await readFile(resolved);
        const ext = path.extname(resolved).toLowerCase() || '.html';
        res.writeHead(200, { 'content-type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
        return;
      } catch {
        if (hasExtension) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }

        const indexPath = path.join(docs, 'index.html');
        try {
          const indexData = await readFile(indexPath);
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(indexData);
        } catch {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(buildIndexHtml());
        }
      }
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });

  server.on('error', (error) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
      console.error(`Port ${port} already in use; exiting.`);
      process.exit(1);
    }
    throw error;
  });

  server.listen(port, host, () => {
    console.log(`Static server listening on http://${host}:${port}`);
  });
};

startServer();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// server started above
