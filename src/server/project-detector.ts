import path from 'node:path';
import { upsertProject } from '../lib/queries';
import type { Project } from '../lib/types';

export function detectProject(projectPath: string, name?: string): Project {
  // Normalize: remove trailing slash, resolve to absolute
  let normalized = path.resolve(projectPath.replace(/\/+$/, ''));

  // Maestri roles: paths like /foo/project/.maestri/roles/UUID
  // → merge into parent project so all Maestri terminals appear under the real project
  const maestriIdx = normalized.indexOf('/.maestri/');
  if (maestriIdx > 0) {
    normalized = normalized.substring(0, maestriIdx);
  }

  const projectName = name?.trim() && !isUUID(name.trim())
    ? name.trim()
    : path.basename(normalized) || 'unknown';

  return upsertProject(normalized, projectName);
}

/** Detect UUID-like strings (Maestri workspace IDs) that shouldn't be used as project names */
function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
