import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOOKS_DIR = path.join(os.homedir(), '.claude', 'hooks');
const HOOKS_JSON = path.join(HOOKS_DIR, 'hooks.json');
const HOOKS_JSON_BAK = path.join(HOOKS_DIR, 'hooks.json.bak');
const HOOK_DEST = path.join(HOOKS_DIR, 'aiox-monitor-hook.py');
const HOOK_SOURCE = path.join(process.cwd(), 'hooks', 'aiox-monitor-hook.py');

const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
] as const;

const HOOK_COMMAND = 'python3 ~/.claude/hooks/aiox-monitor-hook.py';

interface HooksConfig {
  hooks?: Record<string, Array<{ command: string }>>;
}

function main() {
  // 1. Ensure ~/.claude/hooks/ exists
  fs.mkdirSync(HOOKS_DIR, { recursive: true });

  // 2. Copy the Python hook script
  if (!fs.existsSync(HOOK_SOURCE)) {
    console.error(`❌ Hook source not found: ${HOOK_SOURCE}`);
    console.error('   Run this script from the aiox-monitor project directory.');
    process.exit(1);
  }
  fs.copyFileSync(HOOK_SOURCE, HOOK_DEST);
  fs.chmodSync(HOOK_DEST, 0o755);
  console.log(`✅ Hook script copied to: ${HOOK_DEST}`);

  // 3. Read existing hooks.json (or start fresh)
  let config: HooksConfig = {};
  if (fs.existsSync(HOOKS_JSON)) {
    try {
      config = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf-8'));
    } catch {
      console.warn('⚠️  Existing hooks.json is invalid — starting fresh.');
      config = {};
    }
    // 4. Backup before modifying
    fs.copyFileSync(HOOKS_JSON, HOOKS_JSON_BAK);
    console.log(`📦 Backup saved: ${HOOKS_JSON_BAK}`);
  }

  if (!config.hooks) config.hooks = {};

  // 5. Add hook entry for each event type (non-destructive merge)
  let added = 0;
  for (const event of HOOK_EVENTS) {
    if (!config.hooks[event]) config.hooks[event] = [];

    const alreadyInstalled = config.hooks[event].some(
      (entry) => entry.command === HOOK_COMMAND,
    );

    if (!alreadyInstalled) {
      config.hooks[event].push({ command: HOOK_COMMAND });
      added++;
    }
  }

  // 6. Save hooks.json
  fs.writeFileSync(HOOKS_JSON, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  if (added > 0) {
    console.log(`✅ Hook registered for ${added} event type(s) in: ${HOOKS_JSON}`);
  } else {
    console.log('ℹ️  Hook was already registered for all event types.');
  }

  console.log('\n🚀 aiox-monitor hook installed successfully!');
  console.log('   Start the monitor: npm run dev');
  console.log('   Then open: http://localhost:8888');
}

main();
