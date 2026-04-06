// ─── Chat Message Types ─────────────────────────────────────────────────────

export interface ChatArtifact {
  type: 'file' | 'command' | 'code';
  name: string;
  content?: string;
  language?: string;
}

export interface ChatMessage {
  id: string;
  role: 'chief' | 'agent';
  content: string;
  timestamp: string;
  artifacts?: ChatArtifact[];
}

export type ChatEvent =
  | { type: 'chat-message'; terminalId: string; message: ChatMessage }
  | { type: 'chat-clear'; terminalId: string };
