# Obi-Wan — Migration 001 Review
**Job:** JOB-024  
**Reviewer:** Obi-Wan (Architecture)  
**Date:** 2026-04-14  
**Story:** 9.1 · JOB-013  

---

## Arquivos Verificados

| Arquivo | Linhas | Hash |
|---------|--------|------|
| `src/server/db/migrations/001_sala_de_comando_v2.sql` | 161 | lido |
| `src/server/db/migrations/001_sala_de_comando_v2_rollback.sql` | 30 | lido |

---

## Checklist de Revisão

### 1. FK / CASCADE

| Item | Status | Evidência |
|------|--------|-----------|
| `agent_cards.pty_terminal_id` | **OK (intencional)** | Plain TEXT sem FK — comentado nas linhas 7–9: "FK will be added in `002_add_pty_fk.sql`" após merge do JOB-012 |
| `connections.source_id` → agent_cards | **OK** | Linha 46: `REFERENCES agent_cards(id) ON DELETE CASCADE` |
| `connections.target_id` → agent_cards | **OK** | Linha 47: `REFERENCES agent_cards(id) ON DELETE CASCADE` |
| `conversation_participants.conversation_id` → conversations | **OK** | Linha 74: `REFERENCES conversations(id) ON DELETE CASCADE` |
| `conversation_participants.agent_card_id` → agent_cards | **OK** | Linha 75: `REFERENCES agent_cards(id) ON DELETE CASCADE` |
| `messages.conversation_id` → conversations | **OK** | Linha 86: `REFERENCES conversations(id) ON DELETE CASCADE` |
| `messages.sender_id` → agent_cards | **OK** | Linha 87: `REFERENCES agent_cards(id) ON DELETE SET NULL` |
| `messages.in_reply_to` → messages | **OK** | Linha 90: `REFERENCES messages(id) ON DELETE SET NULL` |

Todos os cascades estão corretos. A ausência de FK em `pty_terminal_id` está intencionalmente documentada.

---

### 2. CHECK Constraints — Cobertura de Enums

| Tabela | Campo | Valores | Status |
|--------|-------|---------|--------|
| `agent_cards` | `kind` | `('chat','terminal','hybrid')` | **OK** (linha 22) |
| `agent_cards` | `status` | `('idle','thinking','speaking','waiting','offline','error')` | **OK** (linhas 29–30) |
| `connections` | `kind` | `('chat','broadcast','supervise','context-share')` | **OK** (linha 49) |
| `conversations` | `kind` | `('peer','group','broadcast','chief-thread')` | **OK** (linha 63) |
| `conversation_participants` | `role` | `('member','owner','observer')` | **OK** (linha 76) |
| `messages` | `sender_role` | `('chief','agent','system','tool','user')` | **OK** (linha 88) |
| `agent_catalog` | `source` | `('project','user','builtin')` | **OK** (linha 127) |
| `agent_groups` | `topology` | `('none','chief-hub','mesh','pipeline')` | **OK** (linhas 148–149) |
| `agent_groups` | `source` | `('project','user','auto')` | **OK** (linha 150) |

Todos os enums do schema ref §3.1 estão cobertos com CHECK constraints.

---

### 3. UNIQUE(source_id, target_id, kind) em connections

| Item | Status | Evidência |
|------|--------|-----------|
| Constraint presente | **OK** | Linha 54: `UNIQUE(source_id, target_id, kind)` |

Previne duplicação de arestas no canvas. Correto.

---

### 4. Índices

| Índice | Tabela | Colunas | Status |
|--------|--------|---------|--------|
| `idx_msg_conv_created` | `messages` | `(conversation_id, created_at)` | **OK** (linha 96) |
| `idx_catalog_project` | `agent_catalog` | `(project_path)` | **OK** (linha 133) |
| `idx_groups_project` | `agent_groups` | `(project_path)` | **OK** (linha 156) |

Os 3 índices requeridos estão presentes e com colunas corretas.

---

### 5. user_id NOT NULL DEFAULT 'local'

8 tabelas no total. Distribuição:

| Tabela | user_id | Justificativa |
|--------|---------|---------------|
| `agent_cards` | **OK** (linha 33) | Dado de usuário |
| `connections` | **OK** (linha 52) | Dado de usuário |
| `conversations` | **OK** (linha 65) | Dado de usuário |
| `messages` | **OK** (linha 92) | Dado de usuário |
| `canvas_layouts` | **OK** (linha 104) | Dado de usuário |
| `conversation_participants` | **Ausente** | Join table — user_id implícito via `conversations` |
| `agent_catalog` | **Ausente** | Cache de scanner — escopo por `project_path`, não por usuário |
| `agent_groups` | **Ausente** | Cache de scanner — escopo por `project_path`, não por usuário |

**Observação (não-bloqueante):** 5 de 8 tabelas têm `user_id`. As 3 sem são: uma join table (`conversation_participants`) e dois caches de scanner (`agent_catalog`, `agent_groups`). A ausência é arquiteturalmente justificada — caches de scanner têm escopo por `project_path`, não por sessão de usuário. **Sem divergência com o design intent.**

---

### 6. PKs Compostas

| Tabela | PK | Status |
|--------|-----|--------|
| `agent_catalog` | `PRIMARY KEY(project_path, skill_path)` | **OK** (linha 131) |
| `agent_groups` | `PRIMARY KEY(project_path, group_id)` | **OK** (linha 153) |

Correto. Garante unicidade dentro do contexto de um projeto.

---

### 7. WAL Habilitado

| Pragma | Status | Evidência |
|--------|--------|-----------|
| `PRAGMA journal_mode = WAL` | **OK** | Linha 12 — primeira instrução da migration |
| `PRAGMA foreign_keys = ON` | **OK** | Linha 13 |
| `PRAGMA busy_timeout = 5000` | **OK** | Linha 14 |

WAL está habilitado. O conjunto de PRAGMAs é adequado para concorrência em SQLite.

---

### 8. Ordem do Rollback — FK Conflicts

Rollback (`001_sala_de_comando_v2_rollback.sql`):

```
PRAGMA foreign_keys = OFF          ← desativa FKs antes de dropar
DROP INDEX idx_groups_project
DROP INDEX idx_catalog_project
DROP INDEX idx_msg_conv_created
DROP TABLE agent_groups            ← sem FKs para outras tabelas v2
DROP TABLE agent_catalog           ← sem FKs para outras tabelas v2
DROP TABLE canvas_layouts          ← sem FKs para outras tabelas v2
DROP TABLE messages                ← FK → conversations, agent_cards
DROP TABLE conversation_participants ← FK → conversations, agent_cards
DROP TABLE conversations           ← referenciado por messages, participants
DROP TABLE connections             ← FK → agent_cards
DROP TABLE agent_cards             ← tabela base, referenciada por todas
PRAGMA foreign_keys = ON           ← reabilita ao final
```

**Status: OK.** A ordem é correta mesmo sem `foreign_keys = OFF` — dependentes são dropados antes das suas referências. O `PRAGMA foreign_keys = OFF` é uma proteção adicional correta.

---

## Verdict Final

**APPROVED**

| Categoria | Resultado |
|-----------|-----------|
| FK / CASCADE | ✓ |
| CHECK constraints | ✓ |
| UNIQUE em connections | ✓ |
| Índices | ✓ |
| user_id nas tabelas de dados | ✓ (ausência nas 3 restantes é intencional) |
| PKs compostas | ✓ |
| WAL | ✓ |
| Rollback seguro | ✓ |

**Sem blockers.** Nenhuma correção necessária antes de avançar.

---

## Green-light para Han Solo — Story 9.2

**SIM.** A migration 001 está aprovada para produção. Han Solo pode começar a Story 9.2.

**Pré-condição a lembrar:** `pty_terminal_id` em `agent_cards` é intencionalmente sem FK. A migration `002_add_pty_fk.sql` deve ser criada após merge do branch `feature/sala-comando-v2` com JOB-012 (que cria `command_room_terminals`). Han Solo deve **não** assumir que esse FK existe ao implementar 9.2.
