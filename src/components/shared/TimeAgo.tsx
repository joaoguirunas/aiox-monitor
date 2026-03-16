'use client';

import { useState, useEffect } from 'react';

/** Parse DB timestamp (UTC without suffix) correctly */
function parseUTC(dateStr: string): number {
  // SQLite stores as '2026-03-16 00:58:11' (UTC but no Z suffix)
  // new Date() treats it as local time — append Z to force UTC
  const normalized = dateStr.endsWith('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Date(normalized).getTime();
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - parseUTC(dateStr);
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return 'agora';
  if (secs < 60) return `há ${secs}s`;
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
