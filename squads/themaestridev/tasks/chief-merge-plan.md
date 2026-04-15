---
task: Generate Merge Plan
responsavel: "@chief"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada:
  - campo: stories
    tipo: array
    origem: Status board / user input
    obrigatorio: true
    validacao: "Stories that passed QA"

Saida:
  - campo: merge_plan
    tipo: string
    destino: Chewbacca (DevOps) via Maestri
    persistido: true

Checklist:
  - "[ ] Identify stories that passed QA"
  - "[ ] Determine merge order (dependencies)"
  - "[ ] Check for conflicts between branches"
  - "[ ] Generate merge plan document"
  - "[ ] Send to Chewbacca via maestri ask"
---

# Generate Merge Plan

## Purpose

Analyzes QA-passed stories, determines merge order based on dependencies and potential conflicts, and dispatches the plan to Chewbacca (DevOps) for execution.

## Execution Steps

### Step 1: Identify Ready Stories

Read QA results: `maestri note read "qa-results"`

### Step 2: Plan Merge Order

Consider:
- Story dependencies (which must merge first)
- Branch conflicts (check git diff between branches)
- Critical path items

### Step 3: Send to Chewbacca

```bash
maestri ask "Chewbacca" "Merge plan ready. Order: 1) story-X.1 (Luke), 2) story-X.2 (Han Solo). Please *push in this order."
```

---

*Task created by squad-creator for themaestridev squad*
