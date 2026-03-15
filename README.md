# aiox-monitor

> Real-time dashboard for AI agent monitoring — watch your Claude Code agents work in a virtual isometric office.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-18%2B-green)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)

## What is this?

**aiox-monitor** is a self-hosted monitoring dashboard that visualizes AI agent activity in real time. It hooks into Claude Code, captures every tool call, prompt, and session, then displays everything in a web dashboard with three views: a filterable event log, a Kanban board, and an isometric virtual office where pixel-art agents walk around, sit at desks, take coffee breaks, and reflect their actual working status.

## Features

- **Virtual Office** — Isometric Phaser.js office with pixel-art agents that walk, sit, type, and take breaks
- **Kanban Board** — Projects as columns, agents as status cards with real-time updates
- **Event Log** — Filterable, sortable table of all agent events (tool use, prompts, stops)
- **4 Visual Themes** — Moderno, Espacial, Oldschool, Cyberpunk — switch in real time
- **Real-time Updates** — WebSocket pushes every event and status change instantly
- **Claude Code Hook** — Auto-detects agents, tools, terminals, and sessions
- **Idle Detection** — Automatic status transitions: working > idle > break > offline
- **Company Config** — Customize name, theme, timeouts, and ambient settings
- **PM2 Support** — Production-ready with auto-restart and boot startup
- **SQLite** — Zero-config embedded database with WAL mode

## Quick Start

```bash
git clone https://github.com/joaoguirunas/aiox-monitor.git
cd aiox-monitor
npm run setup
npm run dev          # http://localhost:8888
```

The setup script installs dependencies, creates the database, builds the app, and installs the Claude Code hook.

## Screenshots

> Screenshots will be added after first stable release. Run the app and visit the URLs below.

| View | URL | Description |
|------|-----|-------------|
| Event Log | `/lista` | Filterable table of all agent events |
| Kanban | `/kanban` | Project columns with agent status cards |
| Virtual Office | `/empresa` | Isometric office with pixel-art agents |
| Config | `/empresa/config` | Theme selection, timeouts, company name |

## Architecture

```
Claude Code Hook (Python)
    --> POST /api/events
        --> SQLite (insert event)
        --> agent-tracker (upsert agent status)
        --> terminal-tracker (upsert terminal)
        --> WebSocket broadcast

Idle Detector (30s interval)
    --> working -(5min)-> idle -(15min)-> break -(1h)-> offline
    --> WebSocket broadcast

Frontend (React + Phaser.js)
    --> useWebSocket() --> real-time updates
    --> /lista     --> event table
    --> /kanban    --> project columns
    --> /empresa   --> isometric office (Phaser.js)
    --> /empresa/config --> company settings
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Tailwind CSS |
| Game Engine | Phaser.js 3 (isometric 2:1 projection) |
| Backend | Custom Node.js server (Next.js + WebSocket) |
| Database | SQLite with `node:sqlite` (built-in) |
| Real-time | WebSocket (`ws` library) |
| Process Manager | PM2 |

## Configuration

### Company Settings (`/empresa/config`)

| Setting | Default | Range |
|---------|---------|-------|
| Theme | moderno | moderno, espacial, oldschool, cyberpunk |
| Idle timeout (lounge) | 5 min | 1-30 min |
| Break timeout | 15 min | 5-60 min |
| Offline timeout | 1 hour | fixed |

### Themes

- **Moderno** — Clean, minimal, neutral colors
- **Espacial** — Deep blue, twinkling stars, cyan glow
- **Oldschool** — Wood tones, warm colors, CRT green screens
- **Cyberpunk** — Neon pink/cyan, scanlines, dark atmosphere

Themes apply to the entire office: floor, walls, furniture, ambient effects. Change in real time without page reload.

## Development

```bash
npm run dev          # Start dev server (port 8888)
npm run build        # Build for production
npm run start        # Start production server
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
```

### PM2 (Production)

```bash
npm run pm2:start    # Start with PM2
npm run pm2:stop     # Stop
npm run pm2:restart  # Restart
npm run pm2:logs     # View logs
npm run pm2:startup  # Auto-start on boot (macOS)
npm run pm2:status   # Process status
```

### Project Structure

```
server.ts                    # Custom server (Next.js + WebSocket)
src/
  app/                       # Next.js App Router pages + API routes
  server/                    # Server-side modules (tracker, detector, broadcaster)
  lib/                       # Database, queries, types
  hooks/                     # React hooks (useWebSocket, useEvents, useAgents)
  components/                # UI components (layout, lista, kanban, empresa)
  game/                      # Phaser.js game engine
    scenes/                  # BootScene, OfficeScene
    objects/                 # AgentSprite, Desk, Sofa, CoffeeMachine, etc.
    managers/                # AgentManager (lifecycle, transitions)
    data/                    # Sprite configs, themes, office layout
    animations/              # Frame-based agent animations
    bridge/                  # React <-> Phaser communication
    utils/                   # Isometric utilities, sprite generator
```

## How It Works

1. **Hook captures events** — A Python hook in Claude Code sends every tool use, prompt, and stop event to the monitor via HTTP POST
2. **Server processes** — Events are stored in SQLite, agents/terminals are tracked, and WebSocket broadcasts update all connected clients
3. **Frontend reacts** — React hooks merge WebSocket messages into state, updating the event log, Kanban board, and virtual office in real time
4. **Agents come alive** — In the virtual office, pixel-art agents walk to their desks when working, move to the lounge when idle, grab coffee on break, and leave when offline

## Requirements

- Node.js 18+ (uses `node:sqlite` built-in)
- Python 3.6+ (hook has zero dependencies)
- Claude Code installed

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE)
