'use client';

import { useEffect } from 'react';

export default function CommandRoomError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[CommandRoom] Client error:', error);
  }, [error]);

  return (
    <main className="flex h-[calc(100vh-44px)] bg-surface-0 items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-sm font-medium text-text-primary mb-2">Erro na Sala de Comando</h2>
        <p className="font-mono text-[11px] text-red-400 bg-red-500/10 rounded p-3 text-left break-all mb-4">
          {error.message || 'Erro desconhecido'}
          {error.digest && (
            <span className="block mt-1 text-text-muted text-[10px]">digest: {error.digest}</span>
          )}
        </p>
        <button
          onClick={reset}
          className="btn btn-primary btn-sm font-mono"
        >
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
