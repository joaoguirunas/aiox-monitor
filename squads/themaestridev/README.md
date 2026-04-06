# themaestridev

Dev squad otimizada para orquestração multi-terminal via Maestri CLI. Squad enxuta sem SM/PO/PM — o Architect (Yudhishthira) cria e valida stories, o Chief (Krishna) orquestra tudo via comandos Maestri.

**Tema:** Personagens do Mahabharata

## Squad Composition (12 agents)

| Agent | ID | Icon | Role | Specialization |
|-------|-----|------|------|----------------|
| **Krishna** | chief | 🎯🪈 | Squad Orchestrator | Maestri CLI coordination |
| **Sahadeva** | analyst | 🔍⭐ | Research & Analysis | Technical/market research |
| **Yudhishthira** | architect | 🏛️⚖️ | Architect & Story Creator | Architecture + stories (absorbs SM/PO) |
| **Arjuna** | dev-alpha | 💻🏹 | Frontend Dev | React, Next.js, UI, Tailwind |
| **Bhima** | dev-beta | 💻💪 | Backend Dev | APIs, services, business logic |
| **Nakula** | dev-gamma | 💻🐎 | Fullstack Dev | Glue code, utilities |
| **Duryodhana** | dev-delta | 💻🔥 | Integration Dev | Edge cases, hardening, resilience |
| **Draupadi** | ux-alpha | 🎨🔥 | UI Designer | Components, design system, visual |
| **Kunti** | ux-beta | 🎨🙏 | UX Researcher | User flows, wireframes, accessibility |
| **Vidura** | data-engineer | 🗄️📜 | Database Architect | Schema, migrations, RLS |
| **Drona** | qa | 🧪🎯 | QA Master | Testing, QA gates, code review |
| **Bhishma** | devops | 🚀⚔️ | DevOps Guardian | git push, PRs, CI/CD (EXCLUSIVE) |

## Workflow

```
Krishna (Chief) receives objective
  │
  ├─→ Sahadeva researches (if needed)
  ├─→ Yudhishthira creates stories + defines architecture
  ├─→ Draupadi/Kunti create UI/UX specs (if needed)
  ├─→ Vidura models schema (if needed)
  │
  ├─→ Krishna distributes stories to Devs via Maestri:
  │     ├── maestri ask "Arjuna" "*develop story-X.1"
  │     ├── maestri ask "Bhima" "*develop story-X.2"
  │     ├── maestri ask "Nakula" "*develop story-X.3"
  │     └── maestri ask "Duryodhana" "*develop story-X.4"
  │
  ├─→ Devs work in PARALLEL (isolated worktrees)
  │     └─→ Each marks "Ready for Review" on completion
  │
  ├─→ Krishna dispatches QA:
  │     └── maestri ask "Drona" "*qa-gate story-X.1"
  │
  └─→ Krishna coordinates merge:
        └── maestri ask "Bhishma" "*push"
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

1. **No SM/PO/PM** — Yudhishthira (Architect) absorbs story creation and validation
2. **Maestri CLI orchestration** — Krishna coordinates via multi-terminal commands
3. **4 Dev instances** — Parallel development with suggested specializations
4. **2 UX instances** — UI Design (Draupadi) + UX Research (Kunti)
5. **5-point story validation** (instead of 10-point) — streamlined for speed
6. **Adversarial dev** — Duryodhana focuses on edge cases and hardening

## Setup

1. Each agent runs in a separate terminal with Claude Code
2. Agents register with Maestri using their character name
3. Krishna (Chief) terminal is the orchestration hub
4. Devs use git worktrees for isolation

## Author

João Ramos

## License

MIT
