'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const STORAGE_KEY = 'aiox-selected-project';

interface ProjectContextValue {
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number | null) => void;
}

const ProjectContext = createContext<ProjectContextValue>({
  selectedProjectId: null,
  setSelectedProjectId: () => {},
});

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [selectedProjectId, setSelectedProjectIdState] = useState<number | null>(null);

  // Restore from localStorage on mount (client-side only — avoids hydration mismatch)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const id = parseInt(stored, 10);
      if (!isNaN(id)) setSelectedProjectIdState(id);
    }
  }, []);

  const setSelectedProjectId = (id: number | null) => {
    setSelectedProjectIdState(id);
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  };

  return (
    <ProjectContext.Provider value={{ selectedProjectId, setSelectedProjectId }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  return useContext(ProjectContext);
}
