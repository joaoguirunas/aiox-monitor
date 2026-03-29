import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const dynamic = 'force-dynamic';

interface FolderEntry {
  name: string;
  path: string;
  hasSubfolders: boolean;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawPath = url.searchParams.get('path');
  const currentPath = rawPath || join(homedir(), 'Desktop');

  // Validate path exists and is a directory
  try {
    const stat = statSync(currentPath);
    if (!stat.isDirectory()) {
      return Response.json({ error: 'Path is not a directory' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: 'Path does not exist' }, { status: 400 });
  }

  // Read directory entries
  let entries: string[];
  try {
    entries = readdirSync(currentPath);
  } catch {
    return Response.json({ error: 'Cannot read directory' }, { status: 403 });
  }

  const folders: FolderEntry[] = [];

  for (const name of entries) {
    // Skip hidden folders
    if (name.startsWith('.')) continue;

    const fullPath = join(currentPath, name);
    try {
      const stat = statSync(fullPath);
      if (!stat.isDirectory()) continue;

      // Check if has subfolders
      let hasSubfolders = false;
      try {
        const children = readdirSync(fullPath);
        hasSubfolders = children.some((child) => {
          if (child.startsWith('.')) return false;
          try {
            return statSync(join(fullPath, child)).isDirectory();
          } catch {
            return false;
          }
        });
      } catch {
        // Can't read children, that's fine
      }

      folders.push({ name, path: fullPath, hasSubfolders });
    } catch {
      // Skip entries we can't stat
    }
  }

  // Sort alphabetically
  folders.sort((a, b) => a.name.localeCompare(b.name));

  const parentPath = dirname(currentPath);

  return Response.json({
    currentPath,
    parentPath: parentPath !== currentPath ? parentPath : null,
    folders,
  });
}
