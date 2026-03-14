#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '8888';

try {
  execSync(
    'npx esbuild server.ts --bundle --platform=node --format=esm --packages=external --outfile=.server/server.mjs && node .server/server.mjs',
    { stdio: 'inherit', cwd: root }
  );
} catch {
  process.exit(1);
}
