#!/usr/bin/env node

const command = process.argv[2];

if (command === 'list') {
  list();
} else {
  console.log('Usage: monitor <command>\n');
  console.log('Commands:');
  console.log('  list    Show Command Room terminals (linked to Chief)');
  process.exit(command ? 1 : 0);
}

async function list() {
  const port = process.env.MONITOR_PORT || '8888';
  const url = `http://localhost:${port}/api/command-room/list`;

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error(`✗ Não foi possível conectar em ${url}`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }

  const terminals = data.terminals || [];

  if (terminals.length === 0) {
    console.log('Nenhum terminal na Sala de Comando.');
    return;
  }

  // Group by project path
  const byProject = {};
  for (const t of terminals) {
    const proj = t.projectPath || 'sem projeto';
    if (!byProject[proj]) byProject[proj] = [];
    byProject[proj].push(t);
  }

  // Sort terminals within each project: chief first, then by status, then name
  const statusOrder = { active: 0, idle: 1, spawning: 2, crashed: 3, closed: 4 };
  for (const terms of Object.values(byProject)) {
    terms.sort((a, b) => {
      if (a.is_chief && !b.is_chief) return -1;
      if (!a.is_chief && b.is_chief) return 1;
      const sa = statusOrder[a.pty_status] ?? 5;
      const sb = statusOrder[b.pty_status] ?? 5;
      if (sa !== sb) return sa - sb;
      return (a.agentName || '').localeCompare(b.agentName || '');
    });
  }

  const totalProjects = Object.keys(byProject).length;
  console.log(`\n  Sala de Comando — ${terminals.length} terminais em ${totalProjects} projeto${totalProjects > 1 ? 's' : ''}\n`);

  for (const [projectPath, terms] of Object.entries(byProject)) {
    const projectName = projectPath.split('/').pop() || projectPath;
    const chiefCount = terms.filter(t => t.is_chief).length;
    const activeCount = terms.filter(t => t.pty_status === 'active').length;

    console.log(`  ┌─ ${projectName} (${terms.length} terminais, ${activeCount} ativos)`);
    console.log(`  │  ${projectPath}`);

    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      const isLast = i === terms.length - 1;
      const branch = isLast ? '└' : '├';

      const name = t.agentDisplayName || t.agentName || 'sem nome';
      const type = t.is_chief ? ' ★ chief' : '';
      const category = t.category ? ` [${t.category.name}]` : '';
      const statusLabel = formatStatus(t.pty_status);
      const uptime = formatUptime(t.createdAt);

      console.log(`  ${branch}─ ${name}${type} — ${statusLabel} há ${uptime}${category}`);
    }
    console.log('');
  }
}

function formatStatus(status) {
  const map = {
    active: '● ativo',
    idle: '○ idle',
    spawning: '◌ spawning',
    crashed: '✗ crashed',
    closed: '─ closed',
  };
  return map[status] || status;
}

function formatUptime(createdAt) {
  if (!createdAt) return '?';
  const start = new Date(createdAt);
  if (isNaN(start.getTime())) return '?';
  const now = new Date();
  const diffMs = now - start;
  const mins = Math.floor(diffMs / 60000);

  if (mins < 1) return '<1min';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins > 0 ? `${hours}h${remMins}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d${remHours}h` : `${days}d`;
}
