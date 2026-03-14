import { getProjects } from '@/lib/queries';
import { apiErrorResponse } from '@/lib/api-utils';

export async function GET(): Promise<Response> {
  try {
    const projects = getProjects();
    return Response.json(projects);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
