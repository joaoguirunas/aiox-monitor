import { getProjectWithDetails, getProjectById, deleteProject } from '@/lib/queries';
import { ApiError, apiErrorResponse } from '@/lib/api-utils';
import { ProcessManager } from '@/server/command-room/process-manager';
import { listActiveTerminals, updateTerminalStatus } from '@/lib/command-room-repository';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) throw new ApiError('Invalid id: must be a number', 400);

    const project = getProjectWithDetails(numId);
    if (!project) {
      return Response.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    return Response.json(project);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) throw new ApiError('Invalid id: must be a number', 400);

    const project = getProjectById(numId);
    if (!project) {
      return Response.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    // Kill all active PTY processes for this project
    const pm = ProcessManager.getInstance();
    const activeTerminals = listActiveTerminals().filter((t) => t.project_path === project.path);
    const killedProcesses = pm.killByProject(project.path);
    for (const t of activeTerminals) {
      try { updateTerminalStatus(t.id, 'closed'); } catch { /* ignore */ }
    }

    // Delete project + cascade (including command_room_terminals and orphaned categories)
    const result = deleteProject(numId);

    return Response.json({
      success: true,
      killedProcesses,
      commandRoomTerminals: result.commandRoomTerminals,
      orphanedCategories: result.orphanedCategories,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
