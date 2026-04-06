import { SettingBlock } from './SettingBlock';
import type { CompanyConfig, ThemeName } from '@/lib/types';

const THEMES: { value: ThemeName; label: string; description: string }[] = [
  { value: 'moderno', label: 'Moderno', description: 'Clean, minimal, cores neutras' },
  { value: 'espacial', label: 'Espacial', description: 'Azul profundo, estrelas, glow cyan' },
  { value: 'oldschool', label: 'Oldschool', description: 'Madeira, tons quentes, telas CRT verdes' },
  { value: 'cyberpunk', label: 'Cyberpunk', description: 'Neon, rosa/cyan, scanlines' },
];

interface TabAppearanceProps {
  config: CompanyConfig;
  onThemeChange: (theme: ThemeName) => void;
}

export function TabAppearance({ config, onThemeChange }: TabAppearanceProps) {
  return (
    <div className="space-y-6">
      <SettingBlock label="Tema Visual">
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => onThemeChange(t.value)}
              className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${
                config.theme === t.value
                  ? 'border-accent-orange/50 bg-accent-orange/[0.06] text-text-primary'
                  : 'border-border/40 bg-surface-1/30 text-text-secondary hover:border-border hover:bg-white/[0.02]'
              }`}
            >
              <div className="text-[12px] font-medium">{t.label}</div>
              <div className="text-[11px] text-text-muted mt-0.5">{t.description}</div>
            </button>
          ))}
        </div>
      </SettingBlock>
    </div>
  );
}
