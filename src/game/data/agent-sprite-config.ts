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
    primaryColor: 0x6366f1,
    secondaryColor: 0x4f46e5,
    skinTone: 0xe0c8b0,
    hairStyle: 'short',
    hairColor: 0x3a2a1a,
  },
  '@qa': {
    key: 'agent-qa',
    accessory: 'glasses',
    primaryColor: 0x34d399,
    secondaryColor: 0x10b981,
    skinTone: 0xd4a574,
    hairStyle: 'bun',
    hairColor: 0x1a0e06,
  },
  '@architect': {
    key: 'agent-architect',
    accessory: 'beret',
    primaryColor: 0xa78bfa,
    secondaryColor: 0x8b5cf6,
    skinTone: 0xf5d6b8,
    hairStyle: 'long',
    hairColor: 0x6b3515,
  },
  '@pm': {
    key: 'agent-pm',
    accessory: 'tie',
    primaryColor: 0xfb923c,
    secondaryColor: 0xf97316,
    skinTone: 0xc68642,
    hairStyle: 'short',
    hairColor: 0x0f0f0f,
  },
  '@sm': {
    key: 'agent-sm',
    accessory: 'scarf',
    primaryColor: 0x22d3ee,
    secondaryColor: 0x06b6d4,
    skinTone: 0xe0c8b0,
    hairStyle: 'ponytail',
    hairColor: 0xb49872,
  },
  '@po': {
    key: 'agent-po',
    accessory: 'clipboard',
    primaryColor: 0xfbbf24,
    secondaryColor: 0xf59e0b,
    skinTone: 0xf5d6b8,
    hairStyle: 'short',
    hairColor: 0x3a2a1a,
  },
  '@analyst': {
    key: 'agent-analyst',
    accessory: 'glasses',
    primaryColor: 0x818cf8,
    secondaryColor: 0x6366f1,
    skinTone: 0xd4a574,
    hairStyle: 'spiky',
    hairColor: 0x1a0e06,
  },
  '@devops': {
    key: 'agent-devops',
    accessory: 'cap',
    primaryColor: 0xf87171,
    secondaryColor: 0xef4444,
    skinTone: 0xc68642,
    hairStyle: 'bald',
    hairColor: 0x0f0f0f,
  },
  '@data-engineer': {
    key: 'agent-data',
    accessory: 'headphones',
    primaryColor: 0xf472b6,
    secondaryColor: 0xec4899,
    skinTone: 0xf5d6b8,
    hairStyle: 'long',
    hairColor: 0x0f0f0f,
  },
  '@ux-design-expert': {
    key: 'agent-ux',
    accessory: 'pen',
    primaryColor: 0xe879f9,
    secondaryColor: 0xd946ef,
    skinTone: 0xe0c8b0,
    hairStyle: 'bun',
    hairColor: 0xb49872,
  },
  '@aiox-master': {
    key: 'agent-aiox',
    accessory: 'crown',
    primaryColor: 0xfbbf24,
    secondaryColor: 0xf59e0b,
    skinTone: 0xf5d6b8,
    hairStyle: 'spiky',
    hairColor: 0xfbbf24,
  },
};

const DEFAULT_CONFIG: AgentSpriteConfig = {
  key: 'agent-default',
  accessory: 'none',
  primaryColor: 0x818cf8,
  secondaryColor: 0x6366f1,
  skinTone: 0xe0c8b0,
  hairStyle: 'short',
  hairColor: 0x3a2a1a,
};

export function getAgentSpriteConfig(agentName: string): AgentSpriteConfig {
  return AGENT_SPRITE_CONFIGS[agentName] ?? DEFAULT_CONFIG;
}
