'use client';

import { useState, useEffect } from 'react';
import type { AgentWithStats } from '@/lib/types';

export function useAgents(projectId?: number) {
  const [agents, setAgents] = useState<AgentWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = projectId !== undefined ? `?project_id=${projectId}` : '';
    fetch(`/api/agents${qs}`)
      .then((r) => r.json())
      .then((data: AgentWithStats[]) => {
        setAgents(data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  return { agents, loading };
}
