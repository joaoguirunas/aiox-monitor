import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOOKS_DIR = path.join(os.homedir(), '.claude', 'hooks');
const HOOKS_JSON = path.join(HOOKS_DIR, 'hooks.json');
const HOOK_DEST = path.join(HOOKS_DIR, 'aiox-monitor-hook.py');

const HOOK_COMMAND = 'python3 ~/.claude/hooks/aiox-monitor-hook.py';

interface HooksConfig {
  hooks?: Record<string, Array<{ command: string }>>;
}

function main() {
  let removedEntries = 0;

  // 1. Remove from hooks.json
  if (fs.existsSync(HOOKS_JSON)) {
    let config: HooksConfig = {};
    try {
      config = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf-8'));
    } catch {
      console.warn('⚠️  hooks.json is invalid or unreadable — skipping JSON update.');
    }

    if (config.hooks) {
      for (const event of Object.keys(config.hooks)) {
        const before = config.hooks[event].length;
        config.hooks[event] = config.hooks[event].filter(
          (entry) => entry.command !== HOOK_COMMAND,
        );
        removedEntries += before - config.hooks[event].length;

        // Clean up empty arrays
        if (config.hooks[event].length === 0) {
          delete config.hooks[event];
        }
      }

      // Clean up empty hooks object
      if (Object.keys(config.hooks).length === 0) {
        delete config.hooks;
      }
    }

    fs.writeFileSync(HOOKS_JSON, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    console.log(`✅ Removed ${removedEntries} hook entry(ies) from: ${HOOKS_JSON}`);
  } else {
    console.log('ℹ️  hooks.json not found — nothing to update.');
  }

  // 2. Delete the Python hook script
  if (fs.existsSync(HOOK_DEST)) {
    fs.unlinkSync(HOOK_DEST);
    console.log(`✅ Deleted hook script: ${HOOK_DEST}`);
  } else {
    console.log('ℹ️  Hook script not found — already removed.');
  }

  console.log('\n🗑️  aiox-monitor hook uninstalled successfully.');
}

main();
