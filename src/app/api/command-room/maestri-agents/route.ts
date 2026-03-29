import { execSync } from 'node:child_process';

export const dynamic = 'force-dynamic';

interface MaestriAgent {
  name: string;
  type: 'maestri';
}

export async function GET(): Promise<Response> {
  try {
    const output = execSync('maestri list', {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env, PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin' },
    });

    // Parse "  - name: "DEV 1"" lines
    const agents: MaestriAgent[] = [];
    for (const line of output.split('\n')) {
      const match = line.match(/^\s*-\s*name:\s*"(.+)"$/);
      if (match) {
        agents.push({ name: match[1], type: 'maestri' });
      }
    }

    return Response.json({ agents, connected: true });
  } catch {
    // Maestri not available or not in a Maestri workspace
    return Response.json({ agents: [], connected: false });
  }
}
