'use client';

interface TeamBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (composition: Record<string, number>) => void | Promise<void>;
  maxTerminals: number;
}

export function TeamBuilder({ isOpen, onClose }: TeamBuilderProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96">
        <h2 className="text-white text-lg font-bold mb-4">Team Builder</h2>
        <p className="text-gray-400 text-sm mb-4">Em construção...</p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
