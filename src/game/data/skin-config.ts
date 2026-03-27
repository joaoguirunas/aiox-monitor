/**
 * Sistema de skins para personagens.
 * 4 categorias: 'agents' (default), 'aliens', 'animals', 'humans'
 * Cada skin tem 4 direções (south, east, north, west).
 */

export type SkinCategory = 'agents' | 'aliens' | 'animals' | 'humans';

export interface SkinDefinition {
  id: string;
  label: string;
  category: SkinCategory;
  /** Base path para os PNGs: /sprites/agents/skins/{category}/{id}-{dir}.png */
  basePath: string;
}

// ─── Skins disponíveis ──────────────────────────────────────────

export const ALIEN_SKINS: SkinDefinition[] = [
  { id: 'zyx',    label: 'Zyx (Verde)',          category: 'aliens', basePath: '/sprites/agents/skins/aliens/zyx' },
  { id: 'nebula', label: 'Nebula (Roxo)',        category: 'aliens', basePath: '/sprites/agents/skins/aliens/nebula' },
  { id: 'blip',   label: 'Blip (Azul)',          category: 'aliens', basePath: '/sprites/agents/skins/aliens/blip' },
  { id: 'blorp',  label: 'Blorp (Laranja)',      category: 'aliens', basePath: '/sprites/agents/skins/aliens/blorp' },
  { id: 'nyx',    label: 'Nyx (Cristal Negro)',  category: 'aliens', basePath: '/sprites/agents/skins/aliens/nyx' },
  { id: 'pip',    label: 'Pip (Grey Clássico)',  category: 'aliens', basePath: '/sprites/agents/skins/aliens/pip' },
  { id: 'xara',   label: 'Xara (Jellyfish)',     category: 'aliens', basePath: '/sprites/agents/skins/aliens/xara' },
  { id: 'ruk',    label: 'Ruk (Golem Rocha)',    category: 'aliens', basePath: '/sprites/agents/skins/aliens/ruk' },
  { id: 'flux',   label: 'Flux (Plasma)',        category: 'aliens', basePath: '/sprites/agents/skins/aliens/flux' },
  { id: 'zara',   label: 'Zara (Insectoide)',    category: 'aliens', basePath: '/sprites/agents/skins/aliens/zara' },
  { id: 'aiox-alien', label: 'AIOX Alien Test (128px)', category: 'aliens', basePath: '/sprites/agents/skins/aliens/aiox-alien' },
];

export const ANIMAL_SKINS: SkinDefinition[] = [
  { id: 'cat',     label: 'Gato (Tabby)',       category: 'animals', basePath: '/sprites/agents/skins/animals/cat' },
  { id: 'dog',     label: 'Cão (Shiba Inu)',    category: 'animals', basePath: '/sprites/agents/skins/animals/dog' },
  { id: 'panda',   label: 'Panda',              category: 'animals', basePath: '/sprites/agents/skins/animals/panda' },
  { id: 'fox',     label: 'Raposa',             category: 'animals', basePath: '/sprites/agents/skins/animals/fox' },
  { id: 'lion',    label: 'Leão',               category: 'animals', basePath: '/sprites/agents/skins/animals/lion' },
  { id: 'wolf',    label: 'Lobo Ártico',        category: 'animals', basePath: '/sprites/agents/skins/animals/wolf' },
  { id: 'penguin', label: 'Pinguim',            category: 'animals', basePath: '/sprites/agents/skins/animals/penguin' },
  { id: 'owl',     label: 'Coruja',             category: 'animals', basePath: '/sprites/agents/skins/animals/owl' },
  { id: 'horse',   label: 'Cavalo Negro',       category: 'animals', basePath: '/sprites/agents/skins/animals/horse' },
  { id: 'rabbit',  label: 'Coelho Branco',      category: 'animals', basePath: '/sprites/agents/skins/animals/rabbit' },
];

export const HUMAN_SKINS: SkinDefinition[] = [
  { id: 'human-dex', label: 'Dex (Developer)', category: 'humans', basePath: '/sprites/agents/skins/humans/dex' },
  { id: 'human-quinn', label: 'Quinn (QA)', category: 'humans', basePath: '/sprites/agents/skins/humans/quinn' },
  { id: 'human-aria', label: 'Aria (Architect)', category: 'humans', basePath: '/sprites/agents/skins/humans/aria' },
  { id: 'human-morgan', label: 'Morgan (PM)', category: 'humans', basePath: '/sprites/agents/skins/humans/morgan' },
  { id: 'human-river', label: 'River (SM)', category: 'humans', basePath: '/sprites/agents/skins/humans/river' },
  { id: 'human-pax', label: 'Pax (PO)', category: 'humans', basePath: '/sprites/agents/skins/humans/pax' },
  { id: 'human-alex', label: 'Alex (Analyst)', category: 'humans', basePath: '/sprites/agents/skins/humans/alex' },
  { id: 'human-gage', label: 'Gage (DevOps)', category: 'humans', basePath: '/sprites/agents/skins/humans/gage' },
  { id: 'human-dara', label: 'Dara (Data)', category: 'humans', basePath: '/sprites/agents/skins/humans/dara' },
  { id: 'human-uma', label: 'Uma (UX)', category: 'humans', basePath: '/sprites/agents/skins/humans/uma' },
  { id: 'human-orion', label: 'Orion (Master)', category: 'humans', basePath: '/sprites/agents/skins/humans/orion' },
];

export const ALL_SKINS = [...HUMAN_SKINS, ...ALIEN_SKINS, ...ANIMAL_SKINS];

/** Nome de agente → skin ID. 'default' = usa sprite AIOX original. */
export type SkinAssignment = Record<string, string | 'default'>;

/** Chave no localStorage para persistir a configuração */
export const SKIN_STORAGE_KEY = 'aiox-skin-config';

/** Carrega configuração de skins do localStorage */
export function loadSkinConfig(): SkinAssignment {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SKIN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Salva configuração de skins no localStorage */
export function saveSkinConfig(config: SkinAssignment): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SKIN_STORAGE_KEY, JSON.stringify(config));
}

/** Retorna a skin atribuída a um agente, ou null se for default.
 *  Faz lookup com e sem @ para garantir match independente do formato. */
export function getAgentSkin(agentName: string): SkinDefinition | null {
  const config = loadSkinConfig();
  const withAt = agentName.startsWith('@') ? agentName : `@${agentName}`;
  const withoutAt = agentName.startsWith('@') ? agentName.slice(1) : agentName;
  const skinId = config[withAt] ?? config[withoutAt];
  if (!skinId || skinId === 'default') return null;
  return ALL_SKINS.find(s => s.id === skinId) ?? null;
}

/** Gera paths de direções para uma skin */
export function skinDirectionPaths(skin: SkinDefinition): Record<string, string> {
  return {
    south: `${skin.basePath}-south.png`,
    east: `${skin.basePath}-east.png`,
    north: `${skin.basePath}-north.png`,
    west: `${skin.basePath}-west.png`,
  };
}
