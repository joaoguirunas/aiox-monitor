import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
const SETTINGS_JSON = path.join(CLAUDE_DIR, 'settings.json');
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

interface HookEntry {
  type: string;
  command: string;
  timeout: number;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookEntry[];
}

interface SettingsConfig {
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
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

  // 3. Read existing ~/.claude/settings.json (or start fresh)
  let config: SettingsConfig = {};
  if (fs.existsSync(SETTINGS_JSON)) {
    try {
      config = JSON.parse(fs.readFileSync(SETTINGS_JSON, 'utf-8'));
    } catch {
      console.warn('⚠️  Existing settings.json is invalid — starting fresh.');
      config = {};
    }
  }

  if (!config.hooks) config.hooks = {};

  // 4. Add hook entry for each event type (non-destructive merge)
  const hookEntry: HookEntry = { type: 'command', command: HOOK_COMMAND, timeout: 5 };
  let added = 0;

  for (const event of HOOK_EVENTS) {
    if (!config.hooks[event]) config.hooks[event] = [];

    const alreadyInstalled = config.hooks[event].some((matcher) =>
      matcher.hooks?.some((h) => h.command === HOOK_COMMAND),
    );

    if (!alreadyInstalled) {
      config.hooks[event].push({
        matcher: '',
        hooks: [{ ...hookEntry }],
      });
      added++;
    }
  }

  // 5. Save ~/.claude/settings.json
  fs.writeFileSync(SETTINGS_JSON, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  if (added > 0) {
    console.log(`✅ Hook registered for ${added} event type(s) in: ${SETTINGS_JSON}`);
  } else {
    console.log('ℹ️  Hook was already registered for all event types.');
  }

  console.log('\n🚀 aiox-monitor hook installed globally!');
  console.log('   All Claude Code sessions will now send events to the monitor.');
  console.log('   Start the monitor: npm run dev');
  console.log('   Then open: http://localhost:8888');
}

main();
