---
task: Rebalance Workload
responsavel: "@chief"
responsavel_type: Agent
atomic_layer: Task
elicit: true

Entrada:
  - campo: reason
    tipo: string
    origem: Auto-detected or user request
    obrigatorio: false

Saida:
  - campo: rebalance_plan
    tipo: object
    destino: Maestri Notes + affected agents
    persistido: true

Checklist:
  - "[ ] Assess current workload per agent"
  - "[ ] Identify stalled or overloaded agents"
  - "[ ] Propose redistribution plan"
  - "[ ] Get user confirmation"
  - "[ ] Execute reassignments via maestri ask"
  - "[ ] Update status-board"
---

# Rebalance Workload

## Purpose

Analyzes current workload across all dev agents and redistributes stories to optimize throughput. Triggered manually or when an agent is stalled (3+ checks without progress).

## Execution Steps

### Step 1: Assess Current State

Run `*check-all` and analyze:
- Which agents are blocked/stalled
- Which agents finished early
- Which stories are behind schedule

### Step 2: Propose Redistribution

Present plan to user:
```
Rebalance Proposal:
- Move story-X.3 from Leia (stalled) → Luke (finished early)
- Keep story-X.2 on Han Solo (on track)
```

### Step 3: Execute (after user confirms)

```bash
maestri ask "Leia" "Stop work on story-X.3. Yoda is reassigning it."
maestri ask "Luke" "*develop story-X.3"
```

### Step 4: Update Tracking

```bash
maestri note edit "status-board" "Leia: story-X.3" "Leia: idle | Luke: story-X.3"
```

---

*Task created by squad-creator for themaestridev squad*
