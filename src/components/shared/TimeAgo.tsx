'use client';

import { useState, useEffect } from 'react';

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'agora';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

interface TimeAgoProps {
  dateStr: string;
}

export function TimeAgo({ dateStr }: TimeAgoProps) {
  const [label, setLabel] = useState(() => formatRelative(dateStr));

  useEffect(() => {
    setLabel(formatRelative(dateStr));
    const id = setInterval(() => setLabel(formatRelative(dateStr)), 30_000);
    return () => clearInterval(id);
  }, [dateStr]);

  const fullDate = new Date(dateStr).toLocaleString('pt-BR');

  return (
    <span title={fullDate} className="text-gray-400 text-sm cursor-default">
      {label}
    </span>
  );
}
