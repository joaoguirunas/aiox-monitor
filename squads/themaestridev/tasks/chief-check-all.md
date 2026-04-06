---
task: Check All Agents
responsavel: "@chief"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada: []

Saida:
  - campo: squad_report
    tipo: string
    destino: User + Maestri Notes
    persistido: true

Checklist:
  - "[ ] Run maestri list"
  - "[ ] Run maestri check on each connected agent"
  - "[ ] Compile status report"
  - "[ ] Update status-board note"
  - "[ ] Flag agents with no progress (3+ checks)"
---

# Check All Agents

## Purpose

Runs `maestri check` on every connected agent, compiles a squad-wide status report, and updates the status-board.

## Execution Steps

### Step 1: List Agents

```bash
maestri list
```

### Step 2: Check Each

For each agent in the list:
```bash
maestri check "{agent_name}"
```

### Step 3: Compile Report

Format as:
```
## Squad Status Report — {timestamp}

| Agent | Status | Current Work | Progress |
|-------|--------|-------------|----------|
| Arjuna | active | story-X.1 | implementing step 3 |
| Bhima | active | story-X.2 | tests passing |
| ... | ... | ... | ... |
```

### Step 4: Update Notes

```bash
maestri note write "status-board" "{report}"
```

### Step 5: Flag Stalled Agents

If an agent shows no progress after 3 consecutive checks, flag for `*rebalance`.

---

*Task created by squad-creator for themaestridev squad*
