// Mapeamento de cores Tailwind (agent-colors.ts) para hex Phaser
export const AGENT_PHASER_COLORS: Record<string, number> = {
  '@dev':              0x3b82f6, // blue-500
  '@qa':               0x22c55e, // green-500
  '@architect':        0xa855f7, // purple-500
  '@pm':               0xf97316, // orange-500
  '@sm':               0x06b6d4, // cyan-500
  '@po':               0xeab308, // yellow-500
  '@analyst':          0x6b7280, // gray-500
  '@devops':           0xef4444, // red-500
  '@data-engineer':    0xec4899, // pink-500
  '@ux-design-expert': 0xd946ef, // fuchsia-500
  '@aiox-master':      0xf59e0b, // amber-500
};

export const STATUS_COLORS: Record<string, number> = {
  working: 0x22c55e, // green
  idle:    0x6b7280, // gray
  break:   0xeab308, // yellow
  offline: 0x7f1d1d, // dark red
};

export function getAgentColor(agentName: string): number {
  return AGENT_PHASER_COLORS[agentName] ?? 0x6b7280;
}
