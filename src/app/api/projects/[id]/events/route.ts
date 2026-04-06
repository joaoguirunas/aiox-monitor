import { getProjectById, clearProjectEvents } from '@/lib/queries';
import { ApiError, apiErrorResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

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

    const result = clearProjectEvents(numId);
    return Response.json({ success: true, ...result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
