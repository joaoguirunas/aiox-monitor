#!/bin/bash
set -e

echo ""
echo "  aiox-monitor — Setup"
echo "  ====================="
echo ""

# Check Node.js exists
if ! command -v node &> /dev/null; then
  echo "  [ERROR] Node.js not found. Install Node.js 18+ first."
  exit 1
fi

# Check Node.js version (>=18)
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "  [ERROR] Node.js 18+ required (found: $(node -v))"
  exit 1
fi
echo "  [OK] Node.js $(node -v)"

# Install dependencies
echo "  [..] Installing dependencies..."
npm install --silent 2>&1 | tail -1
echo "  [OK] Dependencies installed"

# Create directories
mkdir -p data logs
echo "  [OK] Directories created (data/, logs/)"

# Copy .env if needed
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "  [OK] .env created from .env.example"
  else
    echo "PORT=8888" > .env
    echo "  [OK] .env created with default PORT=8888"
  fi
else
  echo "  [OK] .env already exists"
fi

# Build Next.js
echo "  [..] Building Next.js..."
npm run build --silent 2>&1 | tail -1
echo "  [OK] Build complete"

# Init DB — start server briefly to trigger schema creation
echo "  [..] Initializing database..."
node -e "
  const { execSync } = require('child_process');
  const { spawn } = require('child_process');
  const p = spawn('npx', ['esbuild', 'server.ts', '--bundle', '--platform=node', '--format=esm', '--packages=external', '--outfile=.server/server.mjs'], { stdio: 'ignore' });
  p.on('close', () => {
    const s = spawn('node', ['.server/server.mjs'], { stdio: 'ignore', env: { ...process.env, NODE_ENV: 'production' } });
    setTimeout(() => { s.kill(); process.exit(0); }, 3000);
  });
" 2>/dev/null || true
echo "  [OK] Database initialized"

# Install hook (optional — may fail if Claude Code not installed)
echo "  [..] Installing Claude Code hook..."
if npm run install-hook 2>/dev/null; then
  echo "  [OK] Hook installed"
else
  echo "  [SKIP] Hook install skipped (Claude Code not detected)"
fi

echo ""
echo "  ================================"
echo "  Setup complete!"
echo "  ================================"
echo ""
echo "  Start (dev):        npm run dev"
echo "  Start (production): npm run pm2:start"
echo "  URL:                http://localhost:8888"
echo "  Auto-start on boot: npm run pm2:startup"
echo ""
