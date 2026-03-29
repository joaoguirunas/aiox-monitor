export const AGENT_BG_COLORS: Record<string, string> = {
  '@dev': 'bg-[#FF4400]',
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
  '@dev': 'text-[#FF4400]',
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
  if (!agentName) return 'bg-[rgba(244,244,232,0.4)]';
  return AGENT_BG_COLORS[agentName] ?? 'bg-[rgba(244,244,232,0.4)]';
}

export function getAgentTextColor(agentName: string | null | undefined): string {
  if (!agentName) return 'text-[rgba(244,244,232,0.4)]';
  return AGENT_TEXT_COLORS[agentName] ?? 'text-[rgba(244,244,232,0.4)]';
}
