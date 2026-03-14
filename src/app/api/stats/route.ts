import { getStats } from '@/lib/queries';
import { apiErrorResponse } from '@/lib/api-utils';

export async function GET(): Promise<Response> {
  try {
    const stats = getStats();
    return Response.json(stats);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
