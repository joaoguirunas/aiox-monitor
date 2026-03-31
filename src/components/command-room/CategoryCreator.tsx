'use client';

import { useState } from 'react';

interface CategoryCreatorProps {
  onClose: () => void;
  onCreated: (category: { id: string; name: string; color: string | null }) => void;
}

const PRESET_COLORS = [
  { name: 'Laranja AIOX', value: '#FF4400' },
  { name: 'Verde', value: '#34d399' },
  { name: 'Azul', value: '#0099FF' },
  { name: 'Roxo', value: '#8B5CF6' },
  { name: 'Amarelo', value: '#f59e0b' },
  { name: 'Vermelho', value: '#EF4444' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Ciano', value: '#06B6D4' },
];

export function CategoryCreator({ onClose, onCreated }: CategoryCreatorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState<string | null>(PRESET_COLORS[0].value);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Nome da categoria é obrigatório');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/command-room/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color: selectedColor,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao criar categoria');
      }

      const data = await res.json();
      onCreated(data.category);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-1 border border-border/60 rounded-lg shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
          <h2 className="text-base font-semibold font-mono text-accent-orange">Nova Categoria</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">
              Nome da Categoria *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Backend, Frontend, DevOps..."
              className="w-full px-3 py-2 bg-surface-2 border border-border/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-orange/50 focus:border-accent-orange"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">
              Descrição (opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve descrição da categoria"
              className="w-full px-3 py-2 bg-surface-2 border border-border/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-orange/50 focus:border-accent-orange"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">
              Cor
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => setSelectedColor(color.value)}
                  className={`flex items-center justify-center h-10 rounded-md border-2 transition-all ${
                    selectedColor === color.value
                      ? 'border-white scale-105'
                      : 'border-transparent hover:border-border/60'
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                >
                  {selectedColor === color.value && (
                    <svg className="w-5 h-5 text-white drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/40">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
            disabled={isCreating}
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
            className="px-4 py-2 bg-accent-orange hover:bg-accent-orange/90 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Criando...' : 'Criar Categoria'}
          </button>
        </div>
      </div>
    </div>
  );
}
