import path from 'node:path';
import { upsertProject } from '@/lib/queries';
import type { Project } from '@/lib/types';

export function detectProject(projectPath: string, name?: string): Project {
  // Normalize: remove trailing slash, resolve to absolute
  const normalized = path.resolve(projectPath.replace(/\/+$/, ''));
  const projectName = name?.trim() || path.basename(normalized) || 'unknown';
  return upsertProject(normalized, projectName);
}
