---
task: Squad Orchestration
responsavel: "@chief"
responsavel_type: Agent
atomic_layer: Task
elicit: true

Entrada:
  - campo: objective
    tipo: string
    origem: User Input
    obrigatorio: true
    validacao: "Epic, stories, ou objetivo livre"

Saida:
  - campo: distribution_plan
    tipo: object
    destino: Maestri Notes (status-board)
    persistido: true

Checklist:
  - "[ ] Run maestri list to see connected agents"
  - "[ ] Analyze objective and break into actionable items"
  - "[ ] Create distribution plan (which agent gets what)"
  - "[ ] Dispatch tasks via maestri ask"
  - "[ ] Write status-board note"
  - "[ ] Monitor progress via maestri check"
---

# Squad Orchestration

## Purpose

Main orchestration task for Krishna (Chief). Receives an objective from the user, analyzes it, distributes work to squad agents via Maestri CLI, and monitors progress.

## Pre-Conditions

```yaml
pre-conditions:
  - [ ] At least 2 agents connected via maestri list
    tipo: pre-condition
    blocker: true
    error_message: "No agents connected. Start agent terminals first."
```

## Execution Steps

### Step 1: Survey the Field

Run `maestri list` to see who is online. Map available agents to their roles.

### Step 2: Analyze Objective

Break the user's objective into discrete work items. Consider:
- Does this need architecture/stories first? → Yudhishthira
- Does this need research? → Sahadeva
- Does this need UI/UX specs? → Draupadi/Kunti
- Does this need schema work? → Vidura
- What can be developed in parallel? → Arjuna/Bhima/Nakula/Duryodhana

### Step 3: Create Distribution Plan

Assign work items to agents based on:
- Agent specialization (suggested, not mandatory)
- Current agent workload
- Story dependencies (sequential vs parallel)

### Step 4: Dispatch via Maestri

```bash
maestri ask "Yudhishthira" "*draft story-name"
maestri ask "Arjuna" "*develop story-X.1"
maestri ask "Bhima" "*develop story-X.2"
```

### Step 5: Track Status

```bash
maestri note write "status-board" "..."
```

### Step 6: Monitor Loop

Periodically check agents and update status-board. When stories complete, dispatch QA. After QA pass, coordinate merge via Bhishma.

---

*Task created by squad-creator for themaestridev squad*
