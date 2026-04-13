# themaestridev

Dev squad otimizada para orquestracao multi-terminal via Maestri CLI. Squad enxuta sem SM/PO/PM — o Architect (Obi-Wan) cria e valida stories, o Chief (Yoda) orquestra tudo via comandos Maestri.

**Tema:** Personagens de Star Wars

## Squad Composition (12 agents)

| Agent | ID | Icon | Role | Specialization |
|-------|-----|------|------|----------------|
| **Yoda** | chief | 🧘‍♂️✨ | Squad Orchestrator | Maestri CLI coordination |
| **Ahsoka** | analyst | 🔍⚔️ | Research & Analysis | Technical/market research |
| **Obi-Wan** | architect | 🏛️⭐ | Architect & Story Creator | Architecture + stories (absorbs SM/PO) |
| **Luke** | dev-alpha | 💻🌟 | Frontend Dev | React, Next.js, UI, Tailwind |
| **Han Solo** | dev-beta | 💻🚀 | Backend Dev | APIs, services, business logic |
| **Leia** | dev-gamma | 💻👑 | Fullstack Dev | Glue code, utilities |
| **Boba Fett** | dev-delta | 💻🎯 | Integration Dev | Edge cases, hardening, resilience |
| **Padmé** | ux-alpha | 🎨👑 | UI Designer | Components, design system, visual |
| **Rey** | ux-beta | 🎨🌟 | UX Researcher | User flows, wireframes, accessibility |
| **R2-D2** | data-engineer | 🗄️🤖 | Database Architect | Schema, migrations, RLS |
| **Mace Windu** | qa | 🧪⚡ | QA Master | Testing, QA gates, code review |
| **Chewbacca** | devops | 🚀🐻 | DevOps Guardian | git push, PRs, CI/CD (EXCLUSIVE) |

## Workflow

```
Yoda (Chief) receives objective
  │
  ├─→ Ahsoka researches (if needed)
  ├─→ Obi-Wan creates stories + defines architecture
  ├─→ Padmé/Rey create UI/UX specs (if needed)
  ├─→ R2-D2 models schema (if needed)
  │
  ├─→ Yoda distributes stories to Devs via Maestri:
  │     ├── maestri ask "Luke" "*develop story-X.1"
  │     ├── maestri ask "Han Solo" "*develop story-X.2"
  │     ├── maestri ask "Leia" "*develop story-X.3"
  │     └── maestri ask "Boba Fett" "*develop story-X.4"
  │
  ├─→ Devs work in PARALLEL (isolated worktrees)
  │     └─→ Each marks "Ready for Review" on completion
  │
  ├─→ Yoda dispatches QA:
  │     └── maestri ask "Mace Windu" "*qa-gate story-X.1"
  │
  └─→ Yoda coordinates merge:
        └── maestri ask "Chewbacca" "*push"
```

## Maestri CLI Commands (Chief only)

| Command | Description |
|---------|-------------|
| `maestri list` | See connected agents |
| `maestri ask "{Name}" "{prompt}"` | Send task to an agent |
| `maestri check "{Name}"` | Read agent's current output |
| `maestri note write "{Name}" "{content}"` | Write shared note |
| `maestri note read "{Name}"` | Read shared note |

## Shared Notes

| Note | Purpose |
|------|---------|
| `status-board` | Current state of each agent and story |
| `decisions` | Architecture and technical decisions |
| `blockers` | Active blockers |
| `qa-results` | QA gate results per story |

## Key Differences from Standard AIOX

1. **No SM/PO/PM** — Obi-Wan (Architect) absorbs story creation and validation
2. **Maestri CLI orchestration** — Yoda coordinates via multi-terminal commands
3. **4 Dev instances** — Parallel development with suggested specializations
4. **2 UX instances** — UI Design (Padmé) + UX Research (Rey)
5. **5-point story validation** (instead of 10-point) — streamlined for speed
6. **Adversarial dev** — Boba Fett focuses on edge cases and hardening

## Setup

1. Each agent runs in a separate terminal with Claude Code
2. Agents register with Maestri using their character name
3. Yoda (Chief) terminal is the orchestration hub
4. Devs use git worktrees for isolation

## Author

João Ramos

## License

MIT
