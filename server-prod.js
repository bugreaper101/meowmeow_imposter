import { createServer } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '.output', 'server', 'index.mjs');
const publicDir = path.join(__dirname, '.output', 'public');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const getRequestBase = (req) => {
  const hostHeader = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  return `http://${hostHeader || 'localhost'}`;
};

const createSafeUrl = (value, base) => {
  try {
    return new URL(value || '/', base);
  } catch {
    return new URL('/', base);
  }
};

const getSafePathname = (url) => {
  try {
    return decodeURIComponent(url.pathname).replace(/^\/+/, '');
  } catch {
    return url.pathname.replace(/^\/+/, '');
  }
};

const clientBundle = (() => {
  if (!existsSync(path.join(publicDir, 'assets'))) return '/assets/index.js';
  const candidates = readdirSync(path.join(publicDir, 'assets'))
    .filter((file) => file.endsWith('.js') && file.startsWith('index-'))
    .sort();
  return candidates.length ? `/assets/${candidates[0]}` : '/assets/index.js';
})();

if (!existsSync(serverEntry)) {
  console.error(`Built server entry not found at ${serverEntry}. Run "npm run build" first.`);
  process.exit(1);
}

const entryUrl = pathToFileURL(serverEntry).href;
const appModule = await import(entryUrl);
const app = appModule.default ?? appModule;
const handler = typeof app?.fetch === 'function' ? app.fetch.bind(app) : null;

const assetHandler = {
  async fetch(request) {
    const url = createSafeUrl(request.url, 'http://localhost');
    const safePath = getSafePathname(url);
    const filePath = path.join(publicDir, safePath || 'index.html');
    const normalized = path.normalize(filePath);

    if (!normalized.startsWith(path.normalize(publicDir))) {
      return new Response('Forbidden', { status: 403 });
    }

    const tries = [normalized];
    if (!path.extname(normalized)) {
      tries.push(path.join(publicDir, safePath, 'index.html'));
    }

    for (const candidate of tries) {
      if (existsSync(candidate)) {
        const body = await import('node:fs/promises').then((fs) => fs.readFile(candidate));
        const ext = path.extname(candidate).toLowerCase();
        const typeMap = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.ico': 'image/x-icon',
          '.txt': 'text/plain; charset=utf-8',
          '.map': 'application/json; charset=utf-8',
        };
        return new Response(body, {
          headers: {
            'Content-Type': typeMap[ext] || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
          status: 200,
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};

if (!handler) {
  console.error('Built server entry does not export a fetch handler.');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    const requestUrl = createSafeUrl(req.url || '/', getRequestBase(req));

    if (requestUrl.pathname.includes('tanstack-start-dev-client-entry')) {
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
      res.end(`import ${JSON.stringify(clientBundle)};`);
      return;
    }

    if (requestUrl.pathname.startsWith('/assets/') || requestUrl.pathname === '/favicon.ico' || requestUrl.pathname === '/robots.txt') {
      const response = await assetHandler.fetch(new Request(requestUrl, {
        method: req.method || 'GET',
        headers: req.headers,
      }));
      const headers = Object.fromEntries(response.headers.entries());
      res.writeHead(response.status, headers);
      if (response.body) {
        const reader = response.body.getReader();
        const pump = async () => {
          let chunk = await reader.read();
          while (!chunk.done) {
            res.write(Buffer.from(chunk.value));
            chunk = await reader.read();
          }
          res.end();
        };
        await pump();
      } else {
        res.end();
      }
      return;
    }

    const method = req.method || 'GET';
    const requestBody = method !== 'GET' && method !== 'HEAD' ? await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    }) : undefined;

    const request = new Request(requestUrl, {
      method,
      headers: req.headers,
      body: requestBody && requestBody.length > 0 ? requestBody : undefined,
    });

    const waitUntil = () => undefined;
    const context = {
      waitUntil,
      passThroughOnException: () => undefined,
      context: {
        waitUntil,
        passThroughOnException: () => undefined,
      },
    };

    const response = await handler(request, { ASSETS: assetHandler }, context);
    const headers = Object.fromEntries(response.headers.entries());
    res.writeHead(response.status, headers);
    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        let chunk = await reader.read();
        while (!chunk.done) {
          res.write(Buffer.from(chunk.value));
          chunk = await reader.read();
        }
        res.end();
      };
      await pump();
      return;
    }
    res.end();
  } catch (error) {
    console.error('Failed to serve request:', error);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(port, host, () => {
  console.log(`Production server listening on http://${host}:${port}`);
});

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});
