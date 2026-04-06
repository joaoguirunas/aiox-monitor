import { SettingBlock } from './SettingBlock';
import { RangeField } from './RangeField';
import type { CompanyConfig } from '@/lib/types';

interface TabGeneralProps {
  config: CompanyConfig;
  onConfigChange: (config: CompanyConfig) => void;
}

export function TabGeneral({ config, onConfigChange }: TabGeneralProps) {
  return (
    <div className="space-y-6">
      <SettingBlock label="Nome da Empresa">
        <input
          type="text"
          value={config.name}
          onChange={(e) => onConfigChange({ ...config, name: e.target.value })}
          className="w-full bg-surface-1/50 border border-border/50 rounded-md px-3 py-2 text-[13px] text-text-primary focus:border-accent-orange/40 focus:outline-none transition-colors"
        />
      </SettingBlock>

      <SettingBlock label="Música Ambiente">
        <button
          onClick={() => onConfigChange({ ...config, ambient_music: config.ambient_music ? 0 : 1 })}
          className="flex items-center gap-2.5"
        >
          <div className={`w-9 h-5 rounded-full transition-colors ${config.ambient_music ? 'bg-accent-orange' : 'bg-surface-3'}`}>
            <div className={`w-4 h-4 mt-0.5 rounded-full bg-white transition-transform ${config.ambient_music ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-[11px] text-text-muted">{config.ambient_music ? 'Ligada' : 'Desligada'}</span>
        </button>
      </SettingBlock>

      <SettingBlock label="Timeouts de Inatividade">
        <p className="text-[11px] text-text-muted/70 mb-3 leading-relaxed">
          Controla o comportamento dos agentes no modo Empresa quando ficam sem atividade.
          Após o primeiro timeout, o agente vai para o lounge. Após o segundo, vai tomar café.
        </p>
        <div className="space-y-3">
          <RangeField
            label="Working → Lounge"
            hint="Tempo sem eventos até o agente ir descansar no lounge"
            value={config.idle_timeout_lounge}
            min={60} max={1800} step={60}
            display={`${Math.round(config.idle_timeout_lounge / 60)} min`}
            onChange={(v) => onConfigChange({ ...config, idle_timeout_lounge: v })}
          />
          <RangeField
            label="Lounge → Café"
            hint="Tempo adicional até o agente ir tomar café (pausa longa)"
            value={config.idle_timeout_break}
            min={300} max={3600} step={60}
            display={`${Math.round(config.idle_timeout_break / 60)} min`}
            onChange={(v) => onConfigChange({ ...config, idle_timeout_break: v })}
          />
        </div>
      </SettingBlock>
    </div>
  );
}
