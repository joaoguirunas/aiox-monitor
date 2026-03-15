import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
const SETTINGS_JSON = path.join(CLAUDE_DIR, 'settings.json');
const HOOK_DEST = path.join(HOOKS_DIR, 'aiox-monitor-hook.py');

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
  let removedEntries = 0;

  // 1. Remove from ~/.claude/settings.json
  if (fs.existsSync(SETTINGS_JSON)) {
    let config: SettingsConfig = {};
    try {
      config = JSON.parse(fs.readFileSync(SETTINGS_JSON, 'utf-8'));
    } catch {
      console.warn('⚠️  settings.json is invalid or unreadable — skipping.');
    }

    if (config.hooks) {
      for (const event of Object.keys(config.hooks)) {
        const before = config.hooks[event].length;
        config.hooks[event] = config.hooks[event].filter(
          (matcher) => !matcher.hooks?.some((h) => h.command === HOOK_COMMAND),
        );
        removedEntries += before - config.hooks[event].length;

        if (config.hooks[event].length === 0) {
          delete config.hooks[event];
        }
      }

      if (Object.keys(config.hooks).length === 0) {
        delete config.hooks;
      }
    }

    fs.writeFileSync(SETTINGS_JSON, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    console.log(`✅ Removed ${removedEntries} hook entry(ies) from: ${SETTINGS_JSON}`);
  } else {
    console.log('ℹ️  settings.json not found — nothing to update.');
  }

  // 2. Delete the Python hook script
  if (fs.existsSync(HOOK_DEST)) {
    fs.unlinkSync(HOOK_DEST);
    console.log(`✅ Deleted hook script: ${HOOK_DEST}`);
  } else {
    console.log('ℹ️  Hook script not found — already removed.');
  }

  // 3. Clean up legacy hooks.json if it exists
  const legacyHooksJson = path.join(HOOKS_DIR, 'hooks.json');
  if (fs.existsSync(legacyHooksJson)) {
    fs.unlinkSync(legacyHooksJson);
    console.log(`✅ Removed legacy hooks.json`);
  }

  console.log('\n🗑️  aiox-monitor hook uninstalled successfully.');
}

main();
