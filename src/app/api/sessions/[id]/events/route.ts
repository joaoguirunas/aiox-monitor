import { getSessionEvents } from '@/lib/queries';
import { parseIntParam, apiErrorResponse, ApiError } from '@/lib/api-utils';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id: idParam } = await params;
    const id = parseIntParam(idParam, 'id');
    if (id === undefined) {
      throw new ApiError('Missing session id', 400);
    }

    const events = getSessionEvents(id);
    return Response.json({ events });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
