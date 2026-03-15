'use client';

import { useState, useEffect } from 'react';
import { setTheme } from '@/game/bridge/react-phaser-bridge';
import type { CompanyConfig, ThemeName } from '@/lib/types';

const THEMES: { value: ThemeName; label: string; description: string }[] = [
  { value: 'moderno', label: 'Moderno', description: 'Clean, minimal, cores neutras' },
  { value: 'espacial', label: 'Espacial', description: 'Azul profundo, estrelas, glow cyan' },
  { value: 'oldschool', label: 'Oldschool', description: 'Madeira, tons quentes, telas CRT verdes' },
  { value: 'cyberpunk', label: 'Cyberpunk', description: 'Neon, rosa/cyan, scanlines' },
];

export default function CompanyConfigPage() {
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/company-config')
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setToast({ type: 'error', message: 'Erro ao carregar configuração' }));
  }, []);

  function handleThemeChange(theme: ThemeName) {
    if (!config) return;
    setConfig({ ...config, theme });
    // Preview imediato via bridge
    setTheme(theme);
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch('/api/company-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          theme: config.theme,
          ambient_music: config.ambient_music,
          idle_timeout_lounge: config.idle_timeout_lounge,
          idle_timeout_break: config.idle_timeout_break,
        }),
      });
      if (!res.ok) throw new Error();
      setToast({ type: 'success', message: 'Configuração guardada!' });
    } catch {
      setToast({ type: 'error', message: 'Erro ao guardar' });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  if (!config) {
    return (
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        <div className="h-8 bg-gray-800 rounded animate-pulse w-1/2" />
        <div className="h-10 bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-800 rounded animate-pulse" />
          ))}
        </div>
        <div className="h-10 bg-gray-800 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold font-mono text-gray-100">
        Configuração da Empresa
      </h1>

      {/* Nome */}
      <div className="space-y-2">
        <label className="block text-sm font-mono text-gray-400">Nome da Empresa</label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => setConfig({ ...config, name: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2
                     text-gray-100 font-mono focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Tema */}
      <div className="space-y-2">
        <label className="block text-sm font-mono text-gray-400">Tema Visual</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => handleThemeChange(t.value)}
              className={`p-3 rounded border font-mono text-left transition
                ${config.theme === t.value
                  ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                }`}
            >
              <div className="font-bold">{t.label}</div>
              <div className="text-xs mt-1 opacity-70">{t.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Idle Timeouts */}
      <div className="space-y-4">
        <label className="block text-sm font-mono text-gray-400">Timeouts de Inactividade</label>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-mono text-gray-500">
            <span>Working → Idle (lounge)</span>
            <span>{Math.round(config.idle_timeout_lounge / 60)} min</span>
          </div>
          <input
            type="range" min={60} max={1800} step={60}
            value={config.idle_timeout_lounge}
            onChange={(e) => setConfig({ ...config, idle_timeout_lounge: Number(e.target.value) })}
            className="w-full accent-blue-500"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-mono text-gray-500">
            <span>Idle → Break (café)</span>
            <span>{Math.round(config.idle_timeout_break / 60)} min</span>
          </div>
          <input
            type="range" min={300} max={3600} step={60}
            value={config.idle_timeout_break}
            onChange={(e) => setConfig({ ...config, idle_timeout_break: Number(e.target.value) })}
            className="w-full accent-blue-500"
          />
        </div>
      </div>

      {/* Ambient Music */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-mono text-gray-400">Música Ambiente</label>
        <button
          onClick={() => setConfig({ ...config, ambient_music: config.ambient_music ? 0 : 1 })}
          className={`w-10 h-5 rounded-full transition ${
            config.ambient_music ? 'bg-blue-500' : 'bg-gray-700'
          }`}
        >
          <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
            config.ambient_music ? 'translate-x-5' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700
                   text-white font-mono rounded transition"
      >
        {saving ? 'Guardando...' : 'Guardar Configuração'}
      </button>

      {/* Toast */}
      {toast && (
        <div className={`p-3 rounded font-mono text-sm ${
          toast.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
