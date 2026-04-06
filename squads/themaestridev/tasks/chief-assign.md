---
task: Assign Story to Agent
responsavel: "@chief"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada:
  - campo: story_id
    tipo: string
    origem: User Input
    obrigatorio: true
  - campo: agent_name
    tipo: string
    origem: User Input
    obrigatorio: true
    validacao: "Must match a Maestri agent name"

Saida:
  - campo: assignment_confirmation
    tipo: string
    destino: Maestri Notes
    persistido: true

Checklist:
  - "[ ] Validate story exists"
  - "[ ] Validate agent is connected (maestri list)"
  - "[ ] Send assignment via maestri ask"
  - "[ ] Update status-board note"
---

# Assign Story to Agent

## Purpose

Assigns a specific story to a specific agent via Maestri CLI. Updates the status-board with the assignment.

## Execution Steps

### Step 1: Validate

Confirm agent is online: `maestri list`

### Step 2: Dispatch

```bash
maestri ask "{agent_name}" "*develop {story_id}"
```

### Step 3: Track

```bash
maestri note edit "status-board" "{agent_name}: idle" "{agent_name}: working on {story_id}"
```

---

*Task created by squad-creator for themaestridev squad*
