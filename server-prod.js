import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '.output', 'server', 'index.mjs');
const port = process.env.PORT || '3000';

if (!existsSync(serverEntry)) {
  console.error(`Built server entry not found at ${serverEntry}. Run "npm run build" first.`);
  process.exit(1);
}

const child = spawn(process.execPath, [serverEntry], {
  cwd: __dirname,
  env: {
    ...process.env,
    PORT: port,
    HOST: process.env.HOST || '0.0.0.0',
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('Failed to start built server:', error);
  process.exit(1);
});
