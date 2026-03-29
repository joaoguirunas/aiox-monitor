'use client';

import { useState, useEffect, useCallback } from 'react';

interface FolderEntry {
  name: string;
  path: string;
  hasSubfolders: boolean;
}

interface BrowseResponse {
  currentPath: string;
  parentPath: string | null;
  folders: FolderEntry[];
}

interface FolderPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function FolderPicker({ isOpen, onClose, onSelect }: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browse = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = path ? `?path=${encodeURIComponent(path)}` : '';
      const res = await fetch(`/api/command-room/browse${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: BrowseResponse = await res.json();
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setFolders(data.folders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to browse');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial directory when opened
  useEffect(() => {
    if (isOpen) {
      browse();
    }
  }, [isOpen, browse]);

  if (!isOpen) return null;

  // Parse breadcrumb segments from currentPath
  const segments = currentPath.split('/').filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-[520px] max-h-[70vh] flex flex-col rounded-xl bg-surface-1 border border-border/60 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-semibold text-text-primary">Selecionar Projeto</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="px-4 py-2 border-b border-border/30 flex items-center gap-1 overflow-x-auto min-h-[36px]">
          <button
            onClick={() => browse('/')}
            className="text-[11px] text-text-muted hover:text-accent-orange transition-colors shrink-0"
          >
            /
          </button>
          {segments.map((seg, i) => {
            const segPath = '/' + segments.slice(0, i + 1).join('/');
            const isLast = i === segments.length - 1;
            return (
              <span key={segPath} className="flex items-center gap-1 shrink-0">
                <svg className="w-3 h-3 text-text-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {isLast ? (
                  <span className="text-[11px] text-text-primary font-medium">{seg}</span>
                ) : (
                  <button
                    onClick={() => browse(segPath)}
                    className="text-[11px] text-text-muted hover:text-accent-orange transition-colors"
                  >
                    {seg}
                  </button>
                )}
              </span>
            );
          })}
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin w-5 h-5 text-text-muted" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : error ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[12px] text-red-400">{error}</p>
              <button
                onClick={() => browse()}
                className="mt-2 text-[11px] text-accent-orange hover:underline"
              >
                Voltar ao Desktop
              </button>
            </div>
          ) : (
            <>
              {/* Back / parent */}
              {parentPath && (
                <button
                  onClick={() => browse(parentPath)}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-white/5 transition-colors border-b border-border/20"
                >
                  <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="text-[12px] text-text-muted">..</span>
                </button>
              )}

              {folders.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[11px] text-text-muted">Nenhuma subpasta encontrada.</p>
                </div>
              ) : (
                folders.map((folder) => (
                  <button
                    key={folder.path}
                    onClick={() => browse(folder.path)}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-white/5 transition-colors"
                  >
                    <svg className="w-4 h-4 text-accent-orange/70 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="text-[12px] text-text-primary flex-1 truncate">{folder.name}</span>
                    {folder.hasSubfolders && (
                      <svg className="w-3.5 h-3.5 text-text-muted/40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-surface-0/50 rounded-b-xl">
          <span className="text-[10px] text-text-muted truncate max-w-[280px]" title={currentPath}>
            {currentPath}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-[12px] text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => { onSelect(currentPath); onClose(); }}
              className="px-3 py-1.5 rounded-md bg-accent-orange hover:bg-accent-orange/90 text-white text-[12px] font-medium transition-colors"
            >
              Selecionar esta pasta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
