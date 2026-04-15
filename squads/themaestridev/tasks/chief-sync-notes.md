---
task: Sync Notes
responsavel: "@chief"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada: []

Saida:
  - campo: updated_notes
    tipo: object
    destino: Maestri Notes
    persistido: true

Checklist:
  - "[ ] Read current status-board"
  - "[ ] Run check-all to get fresh data"
  - "[ ] Update status-board with latest state"
  - "[ ] Update blockers note if any"
  - "[ ] Update decisions note if any new decisions"
---

# Sync Notes

## Purpose

Synchronizes all shared Maestri notes with the current state of the squad. Reads from agents, updates status-board, blockers, and decisions.

## Shared Notes

| Note | Content |
|------|---------|
| status-board | Agent status, current work, progress |
| decisions | Architecture and technical decisions |
| blockers | Active blockers and who is waiting |
| qa-results | QA gate results per story |

## Execution Steps

### Step 1: Read Current State

```bash
maestri note read "status-board"
maestri note read "blockers"
```

### Step 2: Gather Fresh Data

Run `maestri check` on all agents to get latest status.

### Step 3: Update Notes

```bash
maestri note write "status-board" "{updated_content}"
```

---

*Task created by squad-creator for themaestridev squad*
