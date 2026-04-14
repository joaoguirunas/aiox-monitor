# Ahsoka — Agent Catalog Parser Spec

**Job:** JOB-020  
**Owner:** Ahsoka (parser) + Han Solo (scanner/consumer)  
**Story:** Epic 9 / Story 9.1b — Agent Catalog Service  
**Status:** Draft — para revisão por Han Solo antes da implementação  

---

## Índice

1. [Formato de arquivo](#1-formato-de-arquivo)
2. [Regras de parsing — Agent files](#2-regras-de-parsing--agent-files)
3. [Regras de parsing — Group files](#3-regras-de-parsing--group-files)
4. [Merge strategy](#4-merge-strategy)
5. [Tratamento de erros e graceful degradation](#5-tratamento-de-erros-e-graceful-degradation)
6. [Exemplos positivos e negativos](#6-exemplos-positivos-e-negativos)

---

## 1. Formato de arquivo

### 1.1 Agent files

Localização: `{scopeRoot}/.claude/commands/{squad}/agents/{agent_id}.md`

Os arquivos de agente **não** utilizam YAML frontmatter padrão (sem delimitadores `---`). A configuração é um único bloco YAML embutido no corpo do Markdown:

```
# ACTIVATION-NOTICE header (free-text markdown)

ACTIVATION-NOTICE: ...

## COMPLETE AGENT DEFINITION FOLLOWS

```yaml
IDE-FILE-RESOLUTION: ...
activation-instructions: ...
agent:
  name: ...
  id: ...
  ...
persona_profile: ...
persona: ...
commands: [...]
dependencies: {...}
autoClaude: {...}
```  ← fence de fechamento

## Quick Commands

...seções markdown livres...
```

**Implicações para o parser:**
- NÃO tentar parsear frontmatter YAML (`---` delimitado)
- Localizar o primeiro bloco ` ```yaml ` e parsear seu conteúdo
- Todo campo deve ser extraído do YAML interno ou inferido do path/markdown circundante
- Conteúdo após o bloco YAML é texto livre (Quick Commands, Guide, etc.) — ignorar para catálogo

### 1.2 Group files

Localização: `{scopeRoot}/.claude/commands/{squad}/groups/{group_id}.md`

Group files **não existem atualmente** no projeto (nenhum arquivo encontrado em AIOX/groups/). O parser deve suportar a estrutura especificada abaixo para uso futuro sem erros quando o diretório não existe.

---

## 2. Regras de parsing — Agent files

### 2.1 Algoritmo de extração

```
parse(filePath: string): AgentEntry | ParseError

1. Derivar squad e agent_id do path (§2.2)
2. Ler conteúdo do arquivo
3. Extrair bloco YAML embutido (§2.3)
4. Parsear YAML → objeto interno
5. Extrair campos normalizados (§2.4)
6. Validar campos obrigatórios (§2.5)
7. Retornar AgentEntry ou ParseError com degraded=true
```

### 2.2 Campos derivados do path (nunca do conteúdo)

| Campo | Derivação | Exemplo |
|-------|-----------|---------|
| `squad` | Nome do diretório pai de `agents/` | `AIOX` (de `.claude/commands/AIOX/agents/dev.md`) |
| `agent_id` | Basename do arquivo sem extensão | `dev` (de `dev.md`) |
| `skill_path` | Template `/{squad}:agents:{agent_id}` | `/AIOX:agents:dev` |
| `definition_path` | Path relativo à `scopeRoot` | `.claude/commands/AIOX/agents/dev.md` |

**Regra:** `squad` e `agent_id` são sempre derivados do path. Se o YAML interno contiver `agent.id` diferente do basename do arquivo, o basename do arquivo tem precedência (o YAML pode ter divergências durante refatorações).

### 2.3 Extração do bloco YAML embutido

```typescript
function extractYamlBlock(content: string): string | null {
  // Regex: primeiro bloco ```yaml ... ``` no arquivo
  const match = content.match(/^```yaml\s*\n([\s\S]*?)^```/m);
  return match ? match[1] : null;
}
```

- Caso nenhum bloco ` ```yaml ` seja encontrado → erro `MISSING_YAML_BLOCK` (fatal, ver §5)
- Caso o bloco exista mas seja inválido (YAML malformado) → erro `YAML_PARSE_ERROR` (fatal)
- Apenas o **primeiro** bloco ` ```yaml ` é processado; blocos subsequentes são ignorados

### 2.4 Mapeamento de campos

#### 2.4.1 `name` (display_name)

**Prioridade:**
1. `agent.name` do YAML (nome da persona: "Dex", "Aria", etc.)
2. Fallback: primeiro H1 do Markdown (`# Título`) excluindo linhas que contenham "ACTIVATION"
3. Fallback final: `agent_id` capitalizado

```typescript
function extractName(yaml: ParsedYaml, markdown: string): string {
  if (yaml.agent?.name) return yaml.agent.name;
  const h1 = markdown.match(/^# (?!.*ACTIVATION)(.+)$/m);
  if (h1) return h1[1].trim();
  return capitalize(agent_id);
}
```

#### 2.4.2 `icon`

**Prioridade:**
1. `agent.icon` do YAML (campo explícito)
2. Emoji extraído do primeiro H1 do Markdown via regex de emoji Unicode
3. Fallback: `"🤖"`

```typescript
const EMOJI_REGEX = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;

function extractIcon(yaml: ParsedYaml, markdown: string): string {
  if (yaml.agent?.icon) return yaml.agent.icon;
  const h1 = markdown.match(/^# (.+)$/m);
  if (h1) {
    const emojiMatch = h1[1].match(EMOJI_REGEX);
    if (emojiMatch) return emojiMatch[0];
  }
  return "🤖";
}
```

#### 2.4.3 `role` / `title`

**Prioridade:**
1. `persona.role` do YAML
2. `agent.title` do YAML
3. Primeira linha não-vazia de `persona.identity`
4. Fallback: `"Agent"`

```typescript
function extractRole(yaml: ParsedYaml): string {
  return yaml.persona?.role
    ?? yaml.agent?.title
    ?? firstLine(yaml.persona?.identity)
    ?? "Agent";
}
```

#### 2.4.4 `description`

**Prioridade:**
1. `agent.whenToUse` do YAML (truncado a 280 chars com `...` se necessário)
2. Primeiro parágrafo após o bloco YAML no Markdown (seção "Quick Commands" excluída)
3. `persona.identity` do YAML (truncado)
4. Fallback: `""`

```typescript
function extractDescription(yaml: ParsedYaml, postYamlMarkdown: string): string {
  if (yaml.agent?.whenToUse) return truncate(yaml.agent.whenToUse, 280);
  const para = firstParagraph(postYamlMarkdown);
  if (para) return truncate(para, 280);
  if (yaml.persona?.identity) return truncate(yaml.persona.identity, 280);
  return "";
}
```

#### 2.4.5 `persona_tags`

Extraídos de múltiplas fontes, deduplicados, normalizados para lowercase:

```typescript
function extractPersonaTags(yaml: ParsedYaml): string[] {
  const tags: string[] = [];

  // Archetype
  if (yaml.persona_profile?.archetype) tags.push(yaml.persona_profile.archetype.toLowerCase());

  // Communication tone
  if (yaml.persona_profile?.communication?.tone) tags.push(yaml.persona_profile.communication.tone);

  // Vocabulary keywords (max 5)
  const vocab = yaml.persona_profile?.communication?.vocabulary ?? [];
  tags.push(...vocab.slice(0, 5));

  // Core principles keywords (primeiras palavras de cada princípio, max 3 princípios)
  const principles = yaml.persona?.core_principles ?? [];
  principles.slice(0, 3).forEach(p => {
    const keyword = p.split(/[-–—\s]/)[0].toLowerCase();
    if (keyword.length > 2) tags.push(keyword);
  });

  return [...new Set(tags)].filter(t => t.length > 0);
}
```

### 2.5 Campos obrigatórios vs opcionais

| Campo | Obrigatoriedade | Fallback se ausente |
|-------|-----------------|---------------------|
| `squad` | OBRIGATÓRIO | — (derivado do path, nunca ausente) |
| `agent_id` | OBRIGATÓRIO | — (derivado do path, nunca ausente) |
| `skill_path` | OBRIGATÓRIO | — (derivado, nunca ausente) |
| `name` | OBRIGATÓRIO | `capitalize(agent_id)` |
| `icon` | OPCIONAL | `"🤖"` |
| `role` | OPCIONAL | `"Agent"` |
| `description` | OPCIONAL | `""` |
| `persona_tags` | OPCIONAL | `[]` |
| `source` | OBRIGATÓRIO | — (determinado pelo merge, §4) |
| `definition_path` | OBRIGATÓRIO | — (derivado do path, nunca ausente) |

### 2.6 Tipo de saída

```typescript
interface AgentEntry {
  // Campos de identidade (derivados do path)
  squad: string;           // "AIOX"
  agent_id: string;        // "dev"
  skill_path: string;      // "/AIOX:agents:dev"
  definition_path: string; // ".claude/commands/AIOX/agents/dev.md"

  // Campos extraídos
  name: string;            // "Dex"
  icon: string;            // "💻"
  role: string;            // "Expert Senior Software Engineer..."
  description: string;     // Truncado a 280 chars
  persona_tags: string[];  // ["builder", "pragmatic", "construir", ...]

  // Metadados do merge
  source: "project" | "user" | "builtin";
  last_seen_at: string;    // ISO 8601

  // Estado de parse
  parse_warnings: string[]; // Avisos não-fatais acumulados durante extração
}
```

---

## 3. Regras de parsing — Group files

> **Nota:** Group files não existem no projeto atual. Esta seção especifica o formato esperado para uso futuro. O scanner deve ignorar silenciosamente ausência do diretório `groups/`.

### 3.1 Localização

`{scopeRoot}/.claude/commands/{squad}/groups/{group_id}.md`

### 3.2 Formato esperado

Group files usam **frontmatter YAML padrão** (delimitado por `---`), diferente dos agent files:

```markdown
---
name: "Nome do Grupo"
description: "Descrição curta"
members:
  - /AIOX:agents:dev
  - /AIOX:agents:qa
topology: chief-hub
---

# Conteúdo opcional livre...
```

### 3.3 Mapeamento de campos

| Campo | Fonte | Obrigatoriedade | Tipo |
|-------|-------|-----------------|------|
| `name` | Frontmatter `name` | OBRIGATÓRIO | `string` |
| `description` | Frontmatter `description` | OPCIONAL | `string` |
| `members` | Frontmatter `members` | OBRIGATÓRIO | `string[]` |
| `topology` | Frontmatter `topology` | OPCIONAL (default: `"chief-hub"`) | `TopologyEnum` |
| `group_id` | Basename do arquivo | OBRIGATÓRIO (derivado) | `string` |
| `squad` | Diretório pai de `groups/` | OBRIGATÓRIO (derivado) | `string` |

### 3.4 Validação de `skill_path` em `members`

Cada entrada em `members` deve ser validada:

```typescript
// Regex de validação de skill_path
const SKILL_PATH_REGEX = /^\/[A-Za-z0-9_-]+:agents:[A-Za-z0-9_-]+$/;

function validateMember(member: string): boolean {
  return SKILL_PATH_REGEX.test(member);
}
```

Exemplos válidos: `/AIOX:agents:dev`, `/themaestridev:agents:chief`  
Exemplos inválidos: `AIOX:agents:dev` (sem `/`), `/AIOX/agents/dev` (separadores errados), `/AIOX:agents:` (id vazio)

### 3.5 Valores válidos de `topology`

| Valor | Descrição |
|-------|-----------|
| `chief-hub` | Um agente coordena os demais (default) |
| `pipeline` | Agentes em sequência linear |
| `mesh` | Todos se comunicam entre si |
| `none` | Sem topologia definida |

### 3.6 Tipo de saída

```typescript
interface GroupEntry {
  group_id: string;
  squad: string;
  name: string;
  description: string;
  members: string[];          // skill_paths validados
  invalid_members: string[];  // skill_paths que falharam na validação regex
  topology: "chief-hub" | "pipeline" | "mesh" | "none";
  source: "project" | "user" | "builtin";
  parse_warnings: string[];
}
```

---

## 4. Merge strategy

### 4.1 Fontes e precedência

| Prioridade | Escopo | Path | Badge |
|:----------:|--------|------|-------|
| 1 (mais alta) | **project** | `{projectPath}/.claude/commands/` | `"project"` |
| 2 | **user** | `~/.claude/commands/` | `"user"` |
| 3 (fallback) | **builtin** | `packages/aiox-monitor/defaults/commands/` | `"builtin"` |

### 4.2 Chave de deduplicação

A chave de merge é o `skill_path`. Dois agentes com o mesmo `skill_path` de escopos diferentes resultam em **um único entry** vencedor pelo mais específico.

```
/AIOX:agents:dev @ project  →  VENCE (descarta user e builtin)
/AIOX:agents:dev @ user     →  descartado se project existe
/AIOX:agents:dev @ builtin  →  descartado se project ou user existe
```

### 4.3 Algoritmo de merge

```typescript
function mergeAgents(
  project: AgentEntry[],
  user: AgentEntry[],
  builtin: AgentEntry[]
): AgentEntry[] {
  const catalog = new Map<string, AgentEntry>();

  // Inserir em ordem crescente de prioridade (builtin primeiro, project sobrescreve)
  for (const entry of [...builtin, ...user, ...project]) {
    catalog.set(entry.skill_path, entry);
  }

  return Array.from(catalog.values());
}
```

### 4.4 Comportamento com squads diferentes

Agentes do mesmo `squad` mas de escopos diferentes aplicam a regra acima normalmente. Agentes de squads diferentes com mesmo `agent_id` são tratados como entidades distintas pois têm `skill_path` diferentes:

```
/AIOX:agents:dev        ≠  /themaestridev:agents:dev
```

### 4.5 Campo `source`

O campo `source` no `AgentEntry` reflete **de qual escopo o entry vencedor veio**, não onde o arquivo existe duplicado:

```typescript
// Após merge: entry de /AIOX:agents:dev do escopo project
entry.source === "project"  // correto

// Entry de /AIOX:agents:analyst somente no escopo user
entry.source === "user"  // correto
```

---

## 5. Tratamento de erros e graceful degradation

### 5.1 Classificação de erros

| Código | Tipo | Causa | Estratégia |
|--------|------|-------|------------|
| `MISSING_YAML_BLOCK` | FATAL | Arquivo `.md` sem bloco ` ```yaml ` | Skip entry, log warning |
| `YAML_PARSE_ERROR` | FATAL | YAML malformado dentro do bloco | Skip entry, log warning + trecho do erro |
| `MISSING_REQUIRED_FIELD` | DEGRADADO | Campo obrigatório ausente no YAML (agent.name) | Usar fallback, adicionar a `parse_warnings` |
| `INVALID_SKILL_PATH` | DEGRADADO | `skill_path` de `members` não passa no regex | Mover para `invalid_members`, manter entry |
| `FRONTMATTER_MISSING` | FATAL (group) | Group file sem frontmatter `---` | Skip entry, log warning |
| `MEMBER_NOT_IN_CATALOG` | AVISO | `skill_path` válido mas agente não encontrado no catálogo | Adicionar a `parse_warnings`, manter member na lista |
| `FILE_READ_ERROR` | FATAL | Permissão negada ou arquivo corrompido | Skip entry, log erro com path |
| `DIRECTORY_NOT_FOUND` | NÃO-ERRO | Diretório `groups/` ou `agents/` ausente | Return `[]` silenciosamente |

### 5.2 Princípio de graceful degradation

**O catálogo nunca falha completamente.** Um arquivo inválido resulta em skip daquele entry; os demais são processados normalmente. A UI exibe o catálogo parcial sem mensagem de erro ao usuário (apenas log interno).

```typescript
interface ParseResult {
  entries: AgentEntry[];          // Entries bem-sucedidos
  errors: ParseErrorRecord[];     // Erros fatais (arquivo skipped)
  warnings: ParseWarningRecord[]; // Avisos não-fatais (entry incluído com degradação)
}

interface ParseErrorRecord {
  file_path: string;
  error_code: string;
  message: string;
  timestamp: string;
}
```

### 5.3 Validação de member cross-reference

A verificação de `member_not_in_catalog` ocorre **após** o merge completo, não durante o parse individual dos group files. Isso evita falsos positivos por ordem de processamento.

```typescript
// Fase 1: parsear todos agents e groups individualmente
// Fase 2: mergear (project > user > builtin)
// Fase 3: validar members de groups contra catálogo merged
function validateGroupMembers(groups: GroupEntry[], catalog: AgentEntry[]): void {
  const knownPaths = new Set(catalog.map(a => a.skill_path));
  for (const group of groups) {
    group.members.forEach(m => {
      if (!knownPaths.has(m)) {
        group.parse_warnings.push(`MEMBER_NOT_IN_CATALOG: ${m}`);
      }
    });
  }
}
```

### 5.4 Retry e cache de erros

- Arquivos com erro fatal são **re-tentados no próximo evento de `fs.watch`** (uma alteração pode corrigir o problema)
- O parser **não faz cache de erros** — cada scan começa limpo
- Log de erros é emitido via `logger.warn` (nível INFO para `DIRECTORY_NOT_FOUND`, WARN para os demais)

---

## 6. Exemplos positivos e negativos

### 6.1 Exemplo positivo — Agent file completo

**Input:** `.claude/commands/AIOX/agents/dev.md`

```markdown
# dev

ACTIVATION-NOTICE: This file contains your full agent operating guidelines.

## COMPLETE AGENT DEFINITION FOLLOWS

```yaml
agent:
  name: Dex
  id: dev
  title: Expert Senior Software Engineer
  icon: 💻
  whenToUse: |
    Use for all code implementation tasks, bug fixes, and feature development.
    NOT for: architecture decisions → Use @architect.

persona_profile:
  archetype: Builder
  zodiac: '♒ Aquarius'
  communication:
    tone: pragmatic
    vocabulary:
      - construir
      - implementar
      - refatorar

persona:
  role: Expert Senior Software Engineer & Implementation Specialist
  identity: Senior dev focused on clean, testable code

commands:
  - name: help
    visibility: [full, quick, key]
    description: Show commands

autoClaude:
  version: '3.0'
```
```

**Output esperado:**

```json
{
  "squad": "AIOX",
  "agent_id": "dev",
  "skill_path": "/AIOX:agents:dev",
  "definition_path": ".claude/commands/AIOX/agents/dev.md",
  "name": "Dex",
  "icon": "💻",
  "role": "Expert Senior Software Engineer & Implementation Specialist",
  "description": "Use for all code implementation tasks, bug fixes, and feature development. NOT for: architecture decisions → Use @architect.",
  "persona_tags": ["builder", "pragmatic", "construir", "implementar", "refatorar"],
  "source": "project",
  "last_seen_at": "2026-04-14T00:00:00.000Z",
  "parse_warnings": []
}
```

---

### 6.2 Exemplo positivo — Agent com campos mínimos (fallbacks ativados)

**Input:** `.claude/commands/AIOX/agents/helper.md`

```markdown
# 🛠️ Helper Agent

```yaml
agent:
  id: helper
  title: General Helper

persona:
  identity: A simple helper agent for basic tasks
```
```

**Output esperado:**

```json
{
  "squad": "AIOX",
  "agent_id": "helper",
  "skill_path": "/AIOX:agents:helper",
  "definition_path": ".claude/commands/AIOX/agents/helper.md",
  "name": "Helper",
  "icon": "🛠️",
  "role": "General Helper",
  "description": "A simple helper agent for basic tasks",
  "persona_tags": [],
  "source": "project",
  "last_seen_at": "2026-04-14T00:00:00.000Z",
  "parse_warnings": ["MISSING_REQUIRED_FIELD: agent.name (used fallback 'Helper')"]
}
```

**Notas:**
- `name` fallback: `capitalize(agent_id)` = `"Helper"`
- `icon` fallback: extraído do H1 `# 🛠️ Helper Agent` → `"🛠️"`
- `role` fallback: `agent.title` = `"General Helper"`
- `description` fallback: `persona.identity`

---

### 6.3 Exemplo negativo — YAML malformado

**Input:** `.claude/commands/AIOX/agents/broken.md`

```markdown
# Broken Agent

```yaml
agent:
  name: Broken
  id: broken
  title: [invalid yaml here
    this is not valid
```
```

**Output esperado:**

```json
{
  "entries": [],
  "errors": [{
    "file_path": ".claude/commands/AIOX/agents/broken.md",
    "error_code": "YAML_PARSE_ERROR",
    "message": "YAMLException: unexpected end of the stream within a flow collection at line 4",
    "timestamp": "2026-04-14T00:00:00.000Z"
  }]
}
```

---

### 6.4 Exemplo negativo — Sem bloco YAML

**Input:** `.claude/commands/AIOX/agents/legacy.md`

```markdown
# Legacy Agent

Este agente usa formato antigo sem bloco YAML.

Role: Old School Agent
Commands: help, exit
```

**Output esperado:**

```json
{
  "entries": [],
  "errors": [{
    "file_path": ".claude/commands/AIOX/agents/legacy.md",
    "error_code": "MISSING_YAML_BLOCK",
    "message": "No ```yaml block found in file",
    "timestamp": "2026-04-14T00:00:00.000Z"
  }]
}
```

---

### 6.5 Exemplo positivo — Group file válido

**Input:** `.claude/commands/AIOX/groups/dev-team.md`

```markdown
---
name: "Dev Team"
description: "Core development team for feature implementation"
members:
  - /AIOX:agents:dev
  - /AIOX:agents:qa
  - /AIOX:agents:architect
topology: chief-hub
---
```

**Output esperado:**

```json
{
  "group_id": "dev-team",
  "squad": "AIOX",
  "name": "Dev Team",
  "description": "Core development team for feature implementation",
  "members": ["/AIOX:agents:dev", "/AIOX:agents:qa", "/AIOX:agents:architect"],
  "invalid_members": [],
  "topology": "chief-hub",
  "source": "project",
  "parse_warnings": []
}
```

---

### 6.6 Exemplo negativo — Group com member inválido

**Input:** `.claude/commands/AIOX/groups/bad-group.md`

```markdown
---
name: "Bad Group"
members:
  - /AIOX:agents:dev
  - AIOX/agents/broken-path
  - /AIOX:agents:nonexistent
topology: pipeline
---
```

**Output esperado:**

```json
{
  "group_id": "bad-group",
  "squad": "AIOX",
  "name": "Bad Group",
  "description": "",
  "members": ["/AIOX:agents:dev"],
  "invalid_members": ["AIOX/agents/broken-path"],
  "topology": "pipeline",
  "source": "project",
  "parse_warnings": [
    "INVALID_SKILL_PATH: 'AIOX/agents/broken-path' moved to invalid_members",
    "MEMBER_NOT_IN_CATALOG: /AIOX:agents:nonexistent"
  ]
}
```

**Notas:**
- `AIOX/agents/broken-path` → falha no regex → `invalid_members`
- `/AIOX:agents:nonexistent` → regex válido mas não encontrado no catálogo → `parse_warnings`
- Entry é retornado (degradado), não skipped

---

### 6.7 Exemplo — Merge de escopos conflitantes

**Scenario:**

| Escopo | skill_path | name |
|--------|-----------|------|
| project | `/AIOX:agents:dev` | "Dex (Project Override)" |
| user | `/AIOX:agents:dev` | "Dex" |
| user | `/AIOX:agents:helper` | "Helper" |
| builtin | `/AIOX:agents:dev` | "Dex (Builtin)" |

**Output após merge:**

```json
[
  {
    "skill_path": "/AIOX:agents:dev",
    "name": "Dex (Project Override)",
    "source": "project"
  },
  {
    "skill_path": "/AIOX:agents:helper",
    "name": "Helper",
    "source": "user"
  }
]
```

**Regra aplicada:** `/AIOX:agents:dev` existe em 3 escopos → vence `project`. `/AIOX:agents:helper` existe apenas em `user` → `source: "user"`.

---

## Notas de implementação para Han Solo

1. **O scanner** é responsável por chamar `parse()` para cada arquivo encontrado e agregar os `ParseResult` por escopo antes de passar para `mergeAgents()`

2. **O parser** não conhece `projectPath` — recebe apenas o `filePath` absoluto e o `scopeRoot` para derivar `definition_path` relativo

3. **Interface contratual** entre scanner (Han Solo) e parser (Ahsoka):
   ```typescript
   // Han Solo chama:
   const result: ParseResult = parser.parseAgentFile(filePath, scopeRoot, scope);
   ```

4. **Cache:** o parser é stateless — o cache LRU por `projectPath` é responsabilidade do scanner

5. **Regex Unicode:** usar flag `u` no regex de emoji para suporte correto a emoji multi-codepoint

---

*Spec gerada por Atlas (Analyst) — JOB-020 — 2026-04-14*
