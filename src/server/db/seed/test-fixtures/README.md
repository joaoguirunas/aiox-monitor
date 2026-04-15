# Test Fixtures — Sala de Comando v2

**Story:** JOB-043  
**Consumer:** JOB-044 (Mace Windu — 6 Rey journeys E2E)  
**Branch:** `feature/sala-comando-v2`

Fixtures SQLite determinísticos para testes E2E do Epic 9.
Cada arquivo `.sql` é idempotente e independente — podem ser carregados em qualquer ordem alfabética.

---

## Fixtures disponíveis

### `project-a-fixture.sql` — `/fake/project-a`

Projeto rico com cobertura máxima para as journeys de Rey.

| Tabela | Contagem | Detalhe |
|--------|----------|---------|
| `agent_catalog` | 9 agents | squad-x (5), squad-y (3), squad-z (1) |
| `agent_groups` | 5 groups | 2 custom (source=`project`) + 3 auto (source=`auto`) |
| `agent_cards` | 4 cards | chief (is_chief=1), dev, qa, architect |
| `canvas_layouts` | 1 layout | viewport zoom 0.85, 4 posições |
| `connections` | 3 edges | chat, supervise, context-share |
| `conversations` | 2 | peer + group |
| `conversation_participants` | 5 | chief owner em ambas; dev + qa no group |
| `messages` | 20 | 10 em cada conversa |

#### IDs determinísticos

```
Cards:         ac-a-chief, ac-a-dev, ac-a-qa, ac-a-architect
Connections:   conn-a-1, conn-a-2, conn-a-3
Conversations: conv-a-1, conv-a-2
Messages:      msg-a1-01…msg-a1-10, msg-a2-01…msg-a2-10
Groups:        grp-a-custom-1, grp-a-custom-2, grp-a-auto-1, grp-a-auto-2, grp-a-auto-3
```

#### Topologias de grupo

| ID | Nome | Topology | Source |
|----|------|----------|--------|
| `grp-a-custom-1` | Full Stack Squad | chief-hub | project |
| `grp-a-custom-2` | Product Squad | mesh | project |
| `grp-a-auto-1` | squad-x (auto) | chief-hub | auto |
| `grp-a-auto-2` | squad-y (auto) | pipeline | auto |
| `grp-a-auto-3` | squad-z (auto) | none | auto |

---

### `project-b-fixture.sql` — `/fake/project-b`

Projeto minimalista para validar **isolamento entre projetos**.

| Tabela | Contagem |
|--------|----------|
| `agent_catalog` | 2 agents (squad-alpha) |
| `agent_groups` | 1 auto-group |
| `agent_cards` | 2 cards (ac-b-dev, ac-b-qa) |
| `connections` | 1 edge |
| `conversations` | 1 |
| `messages` | 3 |

---

## Como usar

### Carregar fixtures (fresh start)

```bash
npm run test:db:seed
```

Equivalente a:
```bash
TEST_DB_PATH=data/test.db npx tsx scripts/load-test-fixtures.ts
```

### Reset completo

```bash
npm run test:db:reset
```

### DB path customizado

```bash
TEST_DB_PATH=/tmp/my-test.db npm run test:db:seed
```

---

## Uso nos testes E2E (Playwright)

Para que os testes E2E consumam o DB de teste, configure `TEST_DB_PATH` no ambiente do processo do servidor:

```ts
// playwright.config.ts — globalSetup sugerido para JOB-044
export default defineConfig({
  globalSetup: './tests/e2e/global-setup.ts',
  webServer: {
    command: 'TEST_DB_PATH=data/test.db npm run dev',
    url: 'http://localhost:8888',
  },
});
```

```ts
// tests/e2e/global-setup.ts
import { spawnSync } from 'node:child_process';

export default async function globalSetup() {
  spawnSync('npx', ['tsx', 'scripts/reset-test-db.ts'], {
    stdio: 'inherit',
    env: { ...process.env, TEST_DB_PATH: 'data/test.db' },
    shell: true,
  });
}
```

---

## Fluxo de carregamento (`load-test-fixtures.ts`)

```
1. Deleta DB anterior + WAL sidecars (fresh start)
2. Cria novo DatabaseSync em TEST_DB_PATH
3. initSchema()            → tabelas v1 (projects, agents, terminals…)
4. CREATE command_room_terminals (stub v1 para FK da migration 002)
5. migration 001           → tabelas v2 (agent_cards, conversations…)
6. migration 002           → FK pty_terminal_id + triggers
7. *.sql em ordem alfabética → dados de projeto-a e projeto-b
```

---

## Invariantes dos fixtures

- Todas as FKs referenciam IDs que existem no mesmo fixture.
- `last_message_at` em `conversations` coincide com o `created_at` da última mensagem (mantido pelo trigger `trg_messages_sync_last_message_at`).
- `canvas_layouts.updated_at` ≥ `last_active` de qualquer card do projeto.
- Projetos `/fake/project-a` e `/fake/project-b` têm **zero overlap** de IDs.
- `pty_terminal_id` é NULL em todos os cards — `command_room_terminals` está vazio no test DB.
