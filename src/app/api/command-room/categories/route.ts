import { createCategory, listCategories, deleteCategory, updateCategory } from '@/lib/command-room-repository';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const categories = listCategories();
    return Response.json({ categories });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to list categories' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, description, color } = body as {
    name?: string;
    description?: string | null;
    color?: string | null;
  };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Response.json(
      { error: 'name is required and must be a non-empty string' },
      { status: 400 },
    );
  }

  const id = randomUUID();

  try {
    createCategory(id, name.trim(), description ?? null, color ?? null);
    return Response.json({
      category: { id, name: name.trim(), description: description ?? null, color: color ?? null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create category';
    if (message.includes('UNIQUE')) {
      return Response.json({ error: 'Categoria com esse nome ja existe' }, { status: 409 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return Response.json({ error: 'id query parameter is required' }, { status: 400 });
  }

  try {
    deleteCategory(id);
    return Response.json({ deleted: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to delete category' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, name, description, color, display_order } = body as {
    id?: string;
    name?: string;
    description?: string | null;
    color?: string | null;
    display_order?: number;
  };

  if (!id || typeof id !== 'string') {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }

  const updates: { name?: string; description?: string | null; color?: string | null; display_order?: number } = {};
  if (name !== undefined) updates.name = typeof name === 'string' ? name.trim() : undefined;
  if (description !== undefined) updates.description = description;
  if (color !== undefined) updates.color = color;
  if (display_order !== undefined) updates.display_order = display_order;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    updateCategory(id, updates);
    return Response.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update category';
    if (message.includes('UNIQUE')) {
      return Response.json({ error: 'Categoria com esse nome ja existe' }, { status: 409 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
