import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.output', 'public');
const assetsDir = path.join(outputDir, 'assets');
const indexPath = path.join(outputDir, 'index.html');

function listAssets() {
  if (!fs.existsSync(assetsDir)) return [];
  return fs.readdirSync(assetsDir).filter((file) => file.endsWith('.js') || file.endsWith('.css')).sort();
}

if (!fs.existsSync(indexPath)) {
  const assets = listAssets();
  const css = assets.find((file) => file.endsWith('.css')) ?? '';
  const entry = assets.find((file) => file.startsWith('index-') && file.endsWith('.js')) ?? '';

  const html = `<!DOCTYPE html>
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
  fs.writeFileSync(indexPath, html, 'utf8');
}
