# aiox-monitor

Painel de observabilidade local para **Claude Code** + **AIOX agents**.

Captura automaticamente todos os eventos do Claude Code (tool calls, prompts, stops) via hook Python e exibe em tempo real num dashboard local.

## Instalação rápida

```bash
git clone https://github.com/seu-usuario/aiox-monitor
cd aiox-monitor
npm install
npm run install-hook
npm run dev
```

Abra **http://localhost:8888**

## Comandos

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia o servidor na porta 8888 |
| `npm run build` | Build de produção |
| `npm run install-hook` | Instala o hook no Claude Code (`~/.claude/hooks/`) |
| `npm run uninstall-hook` | Remove o hook |

## Como funciona

```
Claude Code (qualquer projeto)
    └── hook Python (~/.claude/hooks/aiox-monitor-hook.py)
            └── POST http://localhost:8888/api/events
                    └── SQLite local (data/monitor.db)
                            └── Dashboard → http://localhost:8888/lista
```

O hook é instalado uma única vez e captura eventos de **todos os projetos** que você abrir no Claude Code.

## Modos de visualização

- **Lista** (`/lista`) — tabela de eventos com filtros por projeto, agente e tipo
- **Kanban** (`/kanban`) — visão por projeto _(Fase 2)_
- **Empresa** (`/empresa`) — modo isométrico com escritório virtual _(Fase 3)_

## Requisitos

- Node.js 22+ (usa `node:sqlite` nativo)
- Python 3.6+ (hook sem dependências externas)
- Claude Code instalado

## Desinstalar hook

```bash
npm run uninstall-hook
```

Remove o hook de `~/.claude/hooks/hooks.json` e deleta o arquivo `.py`.

## Stack

- **Next.js 15** — App Router, porta 8888
- **node:sqlite** — SQLite nativo (Node.js 22+, sem dependências nativas)
- **Tailwind CSS 3** — estilização
- **Python 3 stdlib** — hook zero-dependências
- _(Fase 2)_ WebSocket — atualizações em tempo real
- _(Fase 3)_ Phaser.js — visualização isométrica

## Desenvolvimento

```bash
npm run dev        # servidor em modo watch
npm run typecheck  # verificar tipos TypeScript
npm run lint       # ESLint
npm run build      # build de produção
```

O banco SQLite é criado automaticamente em `data/monitor.db` na primeira execução.
