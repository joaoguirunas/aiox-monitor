export interface AgentSpriteConfig {
  key: string;
  accessory: 'glasses' | 'headset' | 'beret' | 'tie' | 'scarf' | 'clipboard' | 'cap' | 'headphones' | 'pen' | 'crown' | 'none';
  primaryColor: number;
  secondaryColor: number;
  skinTone: number;
  hairStyle: 'short' | 'long' | 'spiky' | 'bun' | 'bald' | 'ponytail';
  hairColor: number;
}

export const AGENT_SPRITE_CONFIGS: Record<string, AgentSpriteConfig> = {
  '@dev': {
    key: 'agent-dev',
    accessory: 'headset',
    primaryColor: 0x3b82f6,
    secondaryColor: 0x1d4ed8,
    skinTone: 0xe0c8b0,
    hairStyle: 'short',
    hairColor: 0x4a3728,
  },
  '@qa': {
    key: 'agent-qa',
    accessory: 'glasses',
    primaryColor: 0x22c55e,
    secondaryColor: 0x15803d,
    skinTone: 0xd4a574,
    hairStyle: 'bun',
    hairColor: 0x2d1b0e,
  },
  '@architect': {
    key: 'agent-architect',
    accessory: 'beret',
    primaryColor: 0xa855f7,
    secondaryColor: 0x7e22ce,
    skinTone: 0xf5d6b8,
    hairStyle: 'long',
    hairColor: 0x8b4513,
  },
  '@pm': {
    key: 'agent-pm',
    accessory: 'tie',
    primaryColor: 0xf97316,
    secondaryColor: 0xc2410c,
    skinTone: 0xc68642,
    hairStyle: 'short',
    hairColor: 0x1a1a1a,
  },
  '@sm': {
    key: 'agent-sm',
    accessory: 'scarf',
    primaryColor: 0x06b6d4,
    secondaryColor: 0x0891b2,
    skinTone: 0xe0c8b0,
    hairStyle: 'ponytail',
    hairColor: 0xc4a882,
  },
  '@po': {
    key: 'agent-po',
    accessory: 'clipboard',
    primaryColor: 0xeab308,
    secondaryColor: 0xca8a04,
    skinTone: 0xf5d6b8,
    hairStyle: 'short',
    hairColor: 0x5c4033,
  },
  '@analyst': {
    key: 'agent-analyst',
    accessory: 'glasses',
    primaryColor: 0x6b7280,
    secondaryColor: 0x4b5563,
    skinTone: 0xd4a574,
    hairStyle: 'spiky',
    hairColor: 0x2d1b0e,
  },
  '@devops': {
    key: 'agent-devops',
    accessory: 'cap',
    primaryColor: 0xef4444,
    secondaryColor: 0xb91c1c,
    skinTone: 0xc68642,
    hairStyle: 'bald',
    hairColor: 0x1a1a1a,
  },
  '@data-engineer': {
    key: 'agent-data',
    accessory: 'headphones',
    primaryColor: 0xec4899,
    secondaryColor: 0xbe185d,
    skinTone: 0xf5d6b8,
    hairStyle: 'long',
    hairColor: 0x1a1a1a,
  },
  '@ux-design-expert': {
    key: 'agent-ux',
    accessory: 'pen',
    primaryColor: 0xd946ef,
    secondaryColor: 0xa21caf,
    skinTone: 0xe0c8b0,
    hairStyle: 'bun',
    hairColor: 0xc4a882,
  },
  '@aiox-master': {
    key: 'agent-aiox',
    accessory: 'crown',
    primaryColor: 0xf59e0b,
    secondaryColor: 0xd97706,
    skinTone: 0xf5d6b8,
    hairStyle: 'spiky',
    hairColor: 0xf59e0b,
  },
};

const DEFAULT_CONFIG: AgentSpriteConfig = {
  key: 'agent-default',
  accessory: 'none',
  primaryColor: 0x6b7280,
  secondaryColor: 0x4b5563,
  skinTone: 0xe0c8b0,
  hairStyle: 'short',
  hairColor: 0x4a3728,
};

export function getAgentSpriteConfig(agentName: string): AgentSpriteConfig {
  return AGENT_SPRITE_CONFIGS[agentName] ?? DEFAULT_CONFIG;
}
