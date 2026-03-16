import { getTerminalsByProject, getProjects } from '@/lib/queries';
import { parseIntParam, apiErrorResponse } from '@/lib/api-utils';
import type { Terminal } from '@/lib/types';

export const dynamic = 'force-dynamic';

export interface TerminalWithMeta extends Terminal {
  project_name?: string;
}

export interface TerminalsResponse {
  terminals: TerminalWithMeta[];
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = parseIntParam(searchParams.get('project_id'), 'project_id');

    let terminals: TerminalWithMeta[] = [];

    if (projectId !== undefined) {
      const raw = getTerminalsByProject(projectId);
      const projects = getProjects();
      const projectMap = new Map(projects.map(p => [p.id, p.name]));
      terminals = raw.map(t => ({
        ...t,
        project_name: projectMap.get(t.project_id),
      }));
    } else {
      const projects = getProjects();
      for (const project of projects) {
        const raw = getTerminalsByProject(project.id);
        terminals.push(...raw.map(t => ({
          ...t,
          project_name: project.name,
        })));
      }
    }

    // Sort: processing first, then active, then inactive, then by last_active desc
    const statusOrder = { processing: 0, active: 1, inactive: 2 };
    terminals.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return b.last_active.localeCompare(a.last_active);
    });

    return Response.json({ terminals } satisfies TerminalsResponse);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
