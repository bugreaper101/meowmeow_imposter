import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.output', 'public');
const docsDir = path.join(root, 'docs');
const assetsDir = path.join(outputDir, 'assets');
const indexPath = path.join(outputDir, 'index.html');

const repoName = 'meowmeow_imposter';
const isPages = Boolean(process.env.GITHUB_ACTIONS);
const base = isPages ? `/${repoName}/` : '/';

function listAssets() {
  if (!fs.existsSync(assetsDir)) return [];
  return fs.readdirSync(assetsDir).filter((file) => file.endsWith('.js') || file.endsWith('.css')).sort();
}

function buildShellHtml() {
  const assets = listAssets();
  const css = assets.find((file) => file.endsWith('.css')) ?? '';
  const entry =
    assets.find((file) => file.startsWith('index-') && file.endsWith('.js')) ??
    assets.find((file) => file.endsWith('.js')) ??
    '';

  if (!entry) {
    throw new Error('No client JavaScript bundle found in .output/public/assets');
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f5eef4" />
    <title>MeowMeow Imposter</title>
    <link rel="icon" href="${base}favicon.ico" />
    <style>html,body,#root{margin:0;min-height:100%;background:#f5eef4}body{font-family:sans-serif;color:#51455e}</style>
    ${css ? `<link rel="stylesheet" href="${base}assets/${css}" />` : ''}
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:wght@500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap" media="print" onload="this.media='all'" />
  </head>
  <body>
    <div id="root"><p style="text-align:center;padding:48px 20px;font-weight:800">meowmeow imposter</p></div>
    <script type="module" src="${base}assets/${entry}"></script>
  </body>
</html>
`;
}

function rewriteAssetUrls(html) {
  return html
    .replaceAll('href="/assets/', `href="${base}assets/`)
    .replaceAll('src="/assets/', `src="${base}assets/`)
    .replaceAll('href="/favicon.ico"', `href="${base}favicon.ico"`)
    .replaceAll('src="/favicon.ico"', `src="${base}favicon.ico"`);
}

function ensureIndexHtml() {
  const shell = buildShellHtml();
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, shell, 'utf8');
    return;
  }

  const existing = fs.readFileSync(indexPath, 'utf8');
  const rewritten = rewriteAssetUrls(existing);
  const hasModuleScript = /<script[^>]+type=["']module["'][^>]+src=/.test(rewritten);
  const hasRoot = rewritten.includes('id="root"') || rewritten.includes("<div id='root'>");
  if (!hasModuleScript) {
    fs.writeFileSync(indexPath, shell, 'utf8');
    return;
  }
  fs.writeFileSync(indexPath, hasRoot ? rewritten : shell, 'utf8');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '_headers' || entry.name === '_redirects') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

if (!fs.existsSync(outputDir)) {
  throw new Error(`Missing ${outputDir}. Run vite build first.`);
}

ensureIndexHtml();
fs.writeFileSync(path.join(outputDir, '.nojekyll'), '');
fs.copyFileSync(indexPath, path.join(outputDir, '404.html'));

if (fs.existsSync(docsDir)) {
  fs.rmSync(docsDir, { recursive: true, force: true });
}
copyDir(outputDir, docsDir);
