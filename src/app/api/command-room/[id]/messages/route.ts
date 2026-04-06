import { ChatMessageStore } from '@/server/command-room/chat-store';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const { searchParams } = new URL(request.url);
  const afterParam = searchParams.get('after');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 100, 500) : 100;

  const store = ChatMessageStore.getInstance();
  let messages = store.getMessages(id);

  // If 'after' is provided, return only messages after that ID
  if (afterParam) {
    const idx = messages.findIndex((m) => m.id === afterParam);
    if (idx >= 0) {
      messages = messages.slice(idx + 1);
    }
  }

  // Apply limit (most recent N messages)
  if (messages.length > limit) {
    messages = messages.slice(-limit);
  }

  return Response.json({
    terminalId: id,
    messages,
    count: messages.length,
    hasMore: store.getMessages(id).length > messages.length,
  });
}
