export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function parseIntParam(value: string | null, name: string): number | undefined {
  if (value === null || value === '') return undefined;
  const n = parseInt(value, 10);
  if (isNaN(n)) throw new ApiError(`Invalid ${name}: must be a number`, 400);
  return n;
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ success: false, error: error.message }, { status: error.status });
  }
  return Response.json({ success: false, error: String(error) }, { status: 500 });
}
