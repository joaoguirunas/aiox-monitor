import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface MaestriTerminal {
  id: string;
  name: string;
  workingDirectory: string;
  workspaceName: string;
}

interface MaestriManifest {
  workspaces: { id: string; name: string; path: string }[];
}

let cache: Map<string, MaestriTerminal> | null = null;
let cacheTime = 0;
const CACHE_TTL = 30_000; // 30s

function loadTerminals(): Map<string, MaestriTerminal> {
  const base = join(homedir(), '.maestri');
  try {
    const manifest: MaestriManifest = JSON.parse(
      readFileSync(join(base, 'manifest.json'), 'utf-8'),
    );

    const map = new Map<string, MaestriTerminal>();
    for (const ws of manifest.workspaces) {
      try {
        const wsData = JSON.parse(
          readFileSync(join(base, ws.path), 'utf-8'),
        );
        const nodes = wsData?.payload?.nodes ?? [];
        for (const node of nodes) {
          const term = node?.content?.terminal?._0;
          if (term?.id && term?.name) {
            map.set(term.id, {
              id: term.id,
              name: term.name,
              workingDirectory: term.workingDirectory ?? '',
              workspaceName: ws.name,
            });
          }
        }
      } catch {
        // workspace file missing or invalid — skip
      }
    }
    return map;
  } catch {
    // Maestri not installed or manifest missing
    return new Map();
  }
}

/**
 * Resolve a Maestri terminal UUID to its user-assigned name.
 * Results are cached for 30s to avoid re-reading JSON on every event.
 */
export function resolveMaestriName(terminalId: string): string | undefined {
  const now = Date.now();
  if (!cache || now - cacheTime > CACHE_TTL) {
    cache = loadTerminals();
    cacheTime = now;
  }
  return cache.get(terminalId)?.name;
}
