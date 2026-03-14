'use client';

import { useState, useEffect } from 'react';
import type { Project } from '@/lib/types';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data: Project[]) => {
        setProjects(data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { projects, loading };
}
