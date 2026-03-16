import { getProjectWithDetails, getProjectById, deleteProject } from '@/lib/queries';
import { ApiError, apiErrorResponse } from '@/lib/api-utils';

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

    deleteProject(numId);
    return Response.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
