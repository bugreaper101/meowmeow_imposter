import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '.output', 'server', 'index.mjs');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

if (!existsSync(serverEntry)) {
  console.error(`Built server entry not found at ${serverEntry}. Run "npm run build" first.`);
  process.exit(1);
}

const entryUrl = pathToFileURL(serverEntry).href;
const appModule = await import(entryUrl);
const app = appModule.default ?? appModule;
const handler = typeof app?.fetch === 'function' ? app.fetch.bind(app) : null;

if (!handler) {
  console.error('Built server entry does not export a fetch handler.');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const request = new Request(requestUrl, {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
    });

    const response = await handler(request, {}, {});
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
