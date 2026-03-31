'use client';

import { ReactNode } from 'react';

interface CategoryRowProps {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  children: ReactNode;
  onAddTerminal?: () => void;
}

export function CategoryRow({
  categoryName,
  categoryColor,
  children,
  onAddTerminal,
}: CategoryRowProps) {
  return (
    <div className="category-row mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-2">
        <div
          className="flex items-center gap-2 border-l-4 pl-3 py-1"
          style={{ borderColor: categoryColor ?? '#FF4400' }}
        >
          <h3
            className="font-semibold text-sm font-mono uppercase tracking-wide"
            style={{ color: categoryColor ?? '#FF4400' }}
          >
            {categoryName}
          </h3>
        </div>

        {onAddTerminal && (
          <button
            onClick={onAddTerminal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-2/50 hover:bg-surface-2 border border-border/40 hover:border-border/60 transition-colors"
            title="Adicionar terminal nesta categoria"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-[11px] font-medium">Terminal</span>
          </button>
        )}
      </div>

      {/* Horizontal scroll container */}
      <div className="relative">
        <div
          className="flex gap-4 overflow-x-auto pb-3 px-2 min-h-[100px]"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,68,0,0.3) transparent',
          }}
        >
          {children || (
            <div className="flex items-center justify-center w-full py-8 text-text-muted text-sm">
              Nenhum terminal nesta categoria. Clique em "+ Terminal" para adicionar.
            </div>
          )}
        </div>

        {/* Scroll gradient hints */}
        <div className="pointer-events-none absolute top-0 left-0 bottom-3 w-8 bg-gradient-to-r from-surface-0 to-transparent" />
        <div className="pointer-events-none absolute top-0 right-0 bottom-3 w-8 bg-gradient-to-l from-surface-0 to-transparent" />

        {/* Inline styles for scrollbar */}
        <style dangerouslySetInnerHTML={{
          __html: `
            .category-row > div > div::-webkit-scrollbar {
              height: 8px;
            }
            .category-row > div > div::-webkit-scrollbar-track {
              background: transparent;
            }
            .category-row > div > div::-webkit-scrollbar-thumb {
              background: rgba(255, 68, 0, 0.3);
              border-radius: 4px;
            }
            .category-row > div > div::-webkit-scrollbar-thumb:hover {
              background: rgba(255, 68, 0, 0.5);
            }
          `
        }} />
      </div>
    </div>
  );
}
