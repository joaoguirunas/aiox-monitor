export const AGENT_BG_COLORS: Record<string, string> = {
  '@dev': 'bg-blue-500',
  '@qa': 'bg-green-500',
  '@architect': 'bg-purple-500',
  '@pm': 'bg-orange-500',
  '@sm': 'bg-cyan-500',
  '@po': 'bg-yellow-500',
  '@analyst': 'bg-gray-500',
  '@devops': 'bg-red-500',
  '@data-engineer': 'bg-pink-500',
  '@ux-design-expert': 'bg-fuchsia-500',
  '@aiox-master': 'bg-amber-500',
};

export const AGENT_TEXT_COLORS: Record<string, string> = {
  '@dev': 'text-blue-300',
  '@qa': 'text-green-300',
  '@architect': 'text-purple-300',
  '@pm': 'text-orange-300',
  '@sm': 'text-cyan-300',
  '@po': 'text-yellow-300',
  '@analyst': 'text-gray-300',
  '@devops': 'text-red-300',
  '@data-engineer': 'text-pink-300',
  '@ux-design-expert': 'text-fuchsia-300',
  '@aiox-master': 'text-amber-300',
};

export function getAgentBgColor(agentName: string | null | undefined): string {
  if (!agentName) return 'bg-gray-600';
  return AGENT_BG_COLORS[agentName] ?? 'bg-gray-600';
}

export function getAgentTextColor(agentName: string | null | undefined): string {
  if (!agentName) return 'text-gray-400';
  return AGENT_TEXT_COLORS[agentName] ?? 'text-gray-400';
}
