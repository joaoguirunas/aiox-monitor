---
task: Draft Story
responsavel: "@architect"
responsavel_type: Agent
atomic_layer: Task
elicit: true

Entrada:
  - campo: story_name
    tipo: string
    origem: User Input
    obrigatorio: true
  - campo: epic_context
    tipo: string
    origem: docs/stories/ or user input
    obrigatorio: false

Saida:
  - campo: story_file
    tipo: file
    destino: docs/stories/
    persistido: true

Checklist:
  - "[ ] Define clear title"
  - "[ ] Write description (problem/need)"
  - "[ ] Define acceptance criteria (testable)"
  - "[ ] Define scope (IN/OUT)"
  - "[ ] Estimate complexity"
  - "[ ] Validate against 5-point checklist"
---

# Draft Story

## Purpose

Yudhishthira (Architect) creates AND validates stories in this squad. This task absorbs the responsibilities of @sm (creation) and @po (validation) into a single streamlined workflow.

## 5-Point Validation Checklist

| # | Check | Required |
|---|-------|----------|
| 1 | Título claro e objetivo | YES |
| 2 | Acceptance criteria testáveis | YES |
| 3 | Scope definido (IN/OUT) | YES |
| 4 | Complexidade estimada | YES |
| 5 | Alinhamento com arquitetura | YES |

**Decision:** GO >= 4/5 | NO-GO < 4/5

## Execution Steps

### Step 1: Gather Requirements

Elicit from user or derive from epic:
- What problem does this solve?
- Who benefits?
- What are the constraints?

### Step 2: Draft Story File

Create in `docs/stories/` following the standard story template with:
- Title, Description, Status (Draft)
- Acceptance Criteria (Given/When/Then preferred)
- Scope IN/OUT
- Complexity estimate
- Technical notes (architecture alignment)

### Step 3: Self-Validate

Run 5-point checklist. If >= 4/5, set status to Ready. If < 4/5, iterate with user.

### Step 4: Notify Chief

After validation, notify Krishna that story is ready for assignment:
- Story ID, title, complexity, suggested assignee based on specialization

---

*Task created by squad-creator for themaestridev squad*
