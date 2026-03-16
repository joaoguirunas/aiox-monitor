export const AGENT_BG_COLORS: Record<string, string> = {
  '@dev': 'bg-[#6366f1]',
  '@qa': 'bg-[#34d399]',
  '@architect': 'bg-[#a78bfa]',
  '@pm': 'bg-[#fb923c]',
  '@sm': 'bg-[#22d3ee]',
  '@po': 'bg-[#fbbf24]',
  '@analyst': 'bg-[#818cf8]',
  '@devops': 'bg-[#f87171]',
  '@data-engineer': 'bg-[#f472b6]',
  '@ux-design-expert': 'bg-[#e879f9]',
  '@aiox-master': 'bg-[#fbbf24]',
};

export const AGENT_TEXT_COLORS: Record<string, string> = {
  '@dev': 'text-[#6366f1]',
  '@qa': 'text-[#34d399]',
  '@architect': 'text-[#a78bfa]',
  '@pm': 'text-[#fb923c]',
  '@sm': 'text-[#22d3ee]',
  '@po': 'text-[#fbbf24]',
  '@analyst': 'text-[#818cf8]',
  '@devops': 'text-[#f87171]',
  '@data-engineer': 'text-[#f472b6]',
  '@ux-design-expert': 'text-[#e879f9]',
  '@aiox-master': 'text-[#fbbf24]',
};

export function getAgentBgColor(agentName: string | null | undefined): string {
  if (!agentName) return 'bg-[#4a5272]';
  return AGENT_BG_COLORS[agentName] ?? 'bg-[#4a5272]';
}

export function getAgentTextColor(agentName: string | null | undefined): string {
  if (!agentName) return 'text-[#4a5272]';
  return AGENT_TEXT_COLORS[agentName] ?? 'text-[#4a5272]';
}
