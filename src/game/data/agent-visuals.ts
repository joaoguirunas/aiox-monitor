// Agent color palette — harmonized for space theme
export const AGENT_PHASER_COLORS: Record<string, number> = {
  '@dev':              0x6366f1, // indigo
  '@qa':               0x34d399, // emerald
  '@architect':        0xa78bfa, // violet
  '@pm':               0xfb923c, // orange
  '@sm':               0x22d3ee, // cyan
  '@po':               0xfbbf24, // yellow
  '@analyst':          0x818cf8, // indigo-light
  '@devops':           0xf87171, // red
  '@data-engineer':    0xf472b6, // pink
  '@ux-design-expert': 0xe879f9, // fuchsia
  '@aiox-master':      0xfbbf24, // amber
};

export const STATUS_COLORS: Record<string, number> = {
  working: 0x34d399, // emerald
  idle:    0x4a5272, // muted
  break:   0xfbbf24, // amber
  offline: 0x374151, // dark
};

export function getAgentColor(agentName: string): number {
  return AGENT_PHASER_COLORS[agentName] ?? 0x818cf8;
}
