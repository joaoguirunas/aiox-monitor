# ⌘K Global Command Palette — Interaction Spec (Story 9.7)

> **Autor:** Rey (UX Beta) — themaestridev
> **Data:** 2026-04-14
> **Status:** Spec final para implementação
> **Consumidor:** Luke (dev-alpha) + Padmé (UI) → Story 9.7 — `CommandPaletteGlobal`
> **Referências:** `docs/SALA-DE-COMANDO-v2-MASTER-PLAN.md §3.5`, `§4.3`, `§2.5.6`; `docs/plans/rey-slash-commands-spec.md`

---

## Sumário

- [Visão Geral](#visão-geral)
- [Trigger e Ciclo de Vida](#trigger-e-ciclo-de-vida)
- [Layout](#layout)
- [Três Modos](#três-modos)
  - [Modo Ações (default)](#modo-ações-default)
  - [Modo Agentes (após `/`)](#modo-agentes-após-)
  - [Modo Comandos (após `>`)](#modo-comandos-após-)
- [Catálogo de Ações Indexadas](#catálogo-de-ações-indexadas)
- [Fuzzy Search](#fuzzy-search)
- [Keyboard Navigation](#keyboard-navigation)
- [Integração Backend](#integração-backend)
- [Acessibilidade](#acessibilidade)
- [Estados e Edge Cases](#estados-e-edge-cases)
- [Tabela de Referência Rápida](#tabela-de-referência-rápida)

---

## Visão Geral

`CommandPaletteGlobal` é o ponto de entrada universal da Sala de Comando v2. Nenhuma ação global exige mouse; tudo começa com ⌘K.

**Separação de contextos:**

| Contexto | Atalho | Componente | Escopo |
|----------|--------|-----------|--------|
| **Global** | `⌘K` / `Ctrl+K` em qualquer lugar do canvas | `CommandPaletteGlobal` | Ações sobre o canvas, conexões, projetos, cenários |
| **Inline** | `/` no composer do node | `SlashMenuInline` | Ações sobre aquele card/conversa específicos |

A paleta global **nunca** repete comandos inline. A separação é estrutural, não apenas visual.

---

## Trigger e Ciclo de Vida

### Abrir

- **Mac:** `⌘K`
- **Outros:** `Ctrl+K`
- Funciona em **qualquer ponto** do canvas — foco não precisa estar em nenhum input.
- Se cursor estiver num `<input>` ou `<textarea>` de um node: o atalho abre a paleta (não insere "K"). Para isso, Luke deve registrar o listener no `document` com `e.preventDefault()`, verificando `e.metaKey || e.ctrlKey`.
- Segundo `⌘K` enquanto aberta: fecha (toggle).

### Fechar

- `Escape`
- Clique fora do painel (`onPointerDownOutside` do Radix Dialog)
- Execução bem-sucedida de uma ação (auto-fecha após 200ms para feedback visual)
- Ações que abrem flows secundários (ex: "Abrir pasta…") fecham imediatamente; o flow é modal separado.

### Estado ao reabrir

- Limpa o query input (começa vazio).
- Mantém o **modo** da sessão anterior dentro da mesma aba (persiste em Zustand, não em localStorage).

---

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔎 [____________________ query input _______________________] [Esc] │
│  ──────────────────────────────────────────────────────────────────  │
│  Modo:  [● Ações]  [○ Agentes (/)]  [○ Comandos (>)]                │
│  ──────────────────────────────────────────────────────────────────  │
│                                                                      │
│  LISTA DE RESULTADOS (esq, 320px)   PAINEL PREVIEW (dir, 280px)     │
│  ─────────────────────────────────  ──────────────────────────────  │
│  ▶ Invocar agente         ⌘K         📋 Invocar agente              │
│    Criar conexão          ⌘K                                         │
│    Salvar cenário         ⌘K         Adiciona um novo agente do      │
│    Carregar cenário       ⌘K         catálogo ao canvas ativo.       │
│    Abrir projeto          ⌘K                                         │
│    Fechar projeto         ⌘K         Atalho: ⌘K → "invocar"         │
│    Alternar tema          ⌘K         ou ⌘K → /                      │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                           ↑↓ navegar · ↵ executar · Tab muda modo   │
└─────────────────────────────────────────────────────────────────────┘
```

**Dimensões:**
- Largura total: `min(640px, 90vw)`
- Altura máxima: `min(480px, 80vh)` — scroll interno na lista
- Painel preview: aparece apenas quando item selecionado tem `description` definida; colapsa (largura 0) se não houver preview
- Posição: centrado horizontal + `top: 15vh`; fundo: `backdrop-blur-sm` + `bg-black/50`

**Lista de resultados:**
- Máx. 8 itens visíveis sem scroll; virtualização só se >50 itens totais
- Grupos separados por `<CommandGroup>` label (ex: "Ações", "Agentes", "Projetos Recentes")
- Item em hover: `bg-surface-300` com transição 80ms
- Item selecionado: `bg-accent/10 border-l-2 border-accent`
- Atalho exibido à direita de cada item (kbd tag)

**Painel preview (direita):**
- Ícone 32px + nome bold + role muted
- Descrição curta (≤3 linhas, truncada com "...")
- Se agente: badge `source` (project / user / builtin) com cor
- Se ação de cenário: lista de nodes/edges do cenário (até 5, depois "+N mais")
- Animação: `opacity 0→1` + `translateX(8px→0)` em 120ms quando item muda

---

## Três Modos

### Modo Ações (default)

**Ativação:** paleta abre neste modo. Sem prefixo no input.

**Conteúdo indexado:** ver [Catálogo de Ações Indexadas](#catálogo-de-ações-indexadas).

**Comportamento do input:**
- Query vazia → mostra todos os itens agrupados
- Query com texto → filtra via fuzzy (ver [Fuzzy Search](#fuzzy-search))
- Digitar `/` no início do input → **transição automática para Modo Agentes**
- Digitar `>` no início do input → **transição automática para Modo Comandos**

---

### Modo Agentes (após `/`)

**Ativação:**
- Digitar `/` no Modo Ações (transição automática)
- Clicar no toggle "Agentes (/)"
- `Tab` a partir do Modo Ações

**O que aparece:**
- Lista de agentes do catálogo do projeto aberto (`GET /api/agents/catalog?projectPath=…`)
- Agrupados por squad, ordenados por `source` (project > user > builtin)
- Badge colorido de `source` ao lado do squad label

**Preview do agente:**
- Lê `definition_path` relativo ao `projectPath` aberto
- Mostra: ícone, nome, role, squad, description, skill_path
- Badge `source` com tooltip mostrando o path absoluto do arquivo

**Ação ao executar (↵):**
- Chama `POST /api/agents/invoke` com `{ skill_path, projectPath, kind: 'chat' }`
- Card aparece no canvas (posição calculada: centro do viewport + offset `{x: +30, y: +30}` por cada card existente)
- Store Zustand recebe evento WS `agent.added` e adiciona o node

**Sub-modo Grupo:**
- Toggle `[● Individual] [○ Grupo]` dentro do painel
- `Tab` enquanto no Modo Agentes cicla entre Individual e Grupo
- Grupo mostra grupos descobertos de `{projectPath}/.claude/commands/{squad}/groups/*.md`
- Executar grupo chama `POST /api/groups/:id/invoke?projectPath=…`

---

### Modo Comandos (após `>`)

**Ativação:**
- Digitar `>` no Modo Ações (transição automática)
- Clicar no toggle "Comandos (>)"
- `Tab` a partir do Modo Agentes

**O que aparece:**
- Subconjunto filtrado de ações específicas de canvas, apresentadas como comandos textuais
- Inclui os mesmos slash commands globais do §4.3 do Master Plan

**Comandos disponíveis neste modo:**

| Comando | Sintaxe no input | Ação |
|---------|-----------------|------|
| Criar conexão | `> connect @Chief @Luke` | `POST /api/connections` |
| Salvar cenário | `> scenario save <nome>` | `PATCH /api/canvas/layout` com `scenario_name` |
| Carregar cenário | `> scenario load <nome>` | Aplica layout salvo + broadcast |
| Alternar tema | `> theme` | Cicla dark/light no store |

**Input parsing:**
- Após `>`, o texto restante é tratado como comando livre
- Autocomplete sugere as opções acima via fuzzy match no texto após `>`
- `@<nome>` em connect → autocomplete via catálogo de cards ativos no canvas

---

## Catálogo de Ações Indexadas

Seis ações nativas, sempre presentes independente do projeto:

### 1. Invocar agente

| Campo | Valor |
|-------|-------|
| `id` | `action.invoke-agent` |
| `label` | "Invocar agente" |
| `description` | "Adiciona um agente do catálogo ao canvas ativo" |
| `icon` | `Plus` |
| `shortcut` | (nenhum — abre Modo Agentes ao executar) |
| **Execução** | Transição para Modo Agentes |

---

### 2. Criar conexão

| Campo | Valor |
|-------|-------|
| `id` | `action.create-connection` |
| `label` | "Criar conexão" |
| `description` | "Liga dois agentes para que troquem contexto" |
| `icon` | `Link` |
| **Execução** | Transição para Modo Comandos com `> connect ` pré-preenchido |

Após executar: input muda para `> connect @` — autocomplete lista cards ativos do canvas (lido do Zustand store, não do backend).

---

### 3. Salvar cenário

| Campo | Valor |
|-------|-------|
| `id` | `action.scenario-save` |
| `label` | "Salvar cenário" |
| `description` | "Persiste o layout atual com um nome" |
| `icon` | `Save` |
| **Execução** | Input muda para `> scenario save _` — aguarda nome; `↵` confirma |

Validação do nome:
- `[a-z0-9\-_]`, min 2 chars, max 40 chars
- Se nome já existe: confirma sobrescrita ("Sobrescrever 'meu-layout'? [↵ sim / Esc não]")
- Payload: `PATCH /api/canvas/layout` com `{ scenario_name, viewport, node_positions }`

---

### 4. Carregar cenário

| Campo | Valor |
|-------|-------|
| `id` | `action.scenario-load` |
| `label` | "Carregar cenário" |
| `description` | "Restaura layout de um cenário salvo" |
| `icon` | `FolderOpen` |
| **Execução** | Lista cenários disponíveis (lidos do `canvas_layouts` via `GET /api/canvas/layouts`) |

Preview do cenário selecionado: miniatura ASCII com nodes + total de edges + data da última edição.

---

### 5. Abrir projeto

| Campo | Valor |
|-------|-------|
| `id` | `action.open-project` |
| `label` | "Abrir projeto" |
| `description` | "Troca o projeto ativo — catálogo e canvas mudam" |
| `icon` | `FolderInput` |
| **Execução** | Dois sub-fluxos alternativos |

**Sub-fluxo A — Recentes:** lista projetos do MRU (`GET /api/projects/recent`). `↵` chama `POST /api/projects/open`.

**Sub-fluxo B — Novo:** item "Abrir pasta…" no topo da lista → fecha paleta → abre file picker nativo (`showDirectoryPicker()` ou input `type="file" webkitdirectory`). Após seleção: `POST /api/projects/open { projectPath }`.

---

### 6. Fechar projeto

| Campo | Valor |
|-------|-------|
| `id` | `action.close-project` |
| `label` | "Fechar projeto" |
| `description` | "Libera watchers e limpa o canvas" |
| `icon` | `FolderMinus` |
| **Execução** | Confirmação inline: "Fechar '[nome do projeto]'? [↵ confirmar / Esc cancelar]" |

Após confirmar: `POST /api/projects/close { projectPath }` → WS `project.closed` → store limpa nodes/edges/catálogo.

---

### 7. Alternar tema

| Campo | Valor |
|-------|-------|
| `id` | `action.toggle-theme` |
| `label` | "Alternar tema" |
| `description` | "Cicla entre dark e light mode" |
| `icon` | `Sun` / `Moon` (alterna conforme tema atual) |
| **Execução** | Imediato; sem confirmação |

Aplica classe `dark` no `<html>` + persiste em `localStorage('theme')`.

---

## Fuzzy Search

**Biblioteca:** `fuse.js` v7 (já no ecossistema shadcn/cmdk; alternativa: `fast-fuzzy` se bundle size for crítico).

**Configuração:**

```ts
const fuse = new Fuse(items, {
  keys: [
    { name: 'label',       weight: 0.5 },
    { name: 'description', weight: 0.25 },
    { name: 'keywords',    weight: 0.25 },  // array de aliases por ação
  ],
  threshold: 0.4,       // 0 = exact, 1 = match anything
  distance: 100,
  includeScore: true,
  ignoreLocation: true,  // importante: não penaliza match no meio da string
});
```

**Aliases de ação** (campo `keywords`):

| Ação | Keywords adicionais |
|------|---------------------|
| Invocar agente | `add agent spawn create` |
| Criar conexão | `link connect edge wire` |
| Salvar cenário | `save layout snapshot` |
| Carregar cenário | `load restore apply scene` |
| Abrir projeto | `open folder project path` |
| Fechar projeto | `close remove exit` |
| Alternar tema | `dark light mode color` |

**Ordenação dos resultados:**
1. Score fuzzy (menor = mais relevante)
2. Tipo: ações nativas > agentes > cenários > projetos recentes
3. Dentro de agentes: project > user > builtin

**Highlight de match:**
- Wrap dos chars correspondentes em `<mark>` com `bg-accent/20`
- Fuse.js v7 retorna `indices` — usar para montar o JSX com highlight

---

## Keyboard Navigation

| Tecla | Ação |
|-------|------|
| `↑` | Move seleção para cima (faz wrap no topo) |
| `↓` | Move seleção para baixo (faz wrap no fim) |
| `↵` / `Enter` | Executa item selecionado |
| `Escape` | Fecha paleta; se sub-fluxo ativo (ex: aguardando nome), cancela sub-fluxo e volta à lista |
| `Tab` | Cicla entre os 3 modos: Ações → Agentes → Comandos → Ações |
| `Shift+Tab` | Cicla em sentido inverso |
| `⌘K` / `Ctrl+K` | Fecha paleta (toggle) |
| `Backspace` | Se query vazia e modo ≠ Ações: volta para Modo Ações; se sub-fluxo ativo, apaga um char do input |
| `Home` / `End` | Seleciona primeiro / último item |
| `⌘↵` / `Ctrl+↵` | Executa agente com `kind='terminal'` em vez de `kind='chat'` (só válido no Modo Agentes) |

**Armadilha crítica:** React Flow intercepta `Backspace`/`Delete` para remover nodes selecionados. Luke **deve** suprimir esses eventos quando a paleta estiver aberta (`e.stopPropagation()` no handler da paleta + `deleteKeyCode={null}` no `<ReactFlow>` quando `paletteOpen === true`).

---

## Integração Backend

### Reads (catálogo)

```
GET /api/agents/catalog?projectPath={encodeURIComponent(path)}
```

Resposta:
```ts
{
  projectPath: string;
  agents: AgentCatalogEntry[];  // ver §2.5.4 do Master Plan
  groups: AgentGroupEntry[];    // ver §2.5.7 do Master Plan
}
```

**Cache:** resultado cacheado no Zustand store; invalidado em evento WS `catalog.updated` ou `catalog.reloaded`.

**Fallback offline:** se request falhar, usa cache stale do store. Badge "⚠ catálogo offline" no rodapé da paleta.

---

### Writes (ações)

| Ação | Método | Rota | Payload |
|------|--------|------|---------|
| Invocar agente (individual) | POST | `/api/agents/invoke` | `{ skill_path, projectPath, kind }` |
| Invocar grupo | POST | `/api/groups/:id/invoke` | `?projectPath=…` |
| Criar conexão | POST | `/api/connections` | `{ source_id, target_id, kind: 'chat' }` |
| Salvar cenário | PATCH | `/api/canvas/layout` | `{ scenario_name, viewport, node_positions }` |
| Carregar cenário | GET | `/api/canvas/layout?scenario=…` | — |
| Abrir projeto | POST | `/api/projects/open` | `{ projectPath }` |
| Fechar projeto | POST | `/api/projects/close` | `{ projectPath }` |

**Publicação no store (antes do round-trip):**
Para ações de UI local (alternar tema, selecionar modo), o store é atualizado **optimisticamente** — sem aguardar backend.
Para ações com side-effects (invocar agente, criar conexão): store atualiza **ao receber o evento WS** correspondente, não na resposta HTTP — evita duplicação se múltiplas abas estiverem abertas.

---

## Acessibilidade

- Paleta usa `role="dialog"` + `aria-label="Paleta de comandos"` (Radix Dialog já faz isso)
- Lista usa `role="listbox"` com `aria-activedescendant` apontando para o item selecionado
- Cada item: `role="option"` + `aria-selected`
- Modo toggle: `role="tablist"` + `role="tab"` + `aria-selected`
- Preview à direita: `aria-live="polite"` para anunciar conteúdo ao mudar item selecionado
- `prefers-reduced-motion`: sem animações de slide; apenas `opacity 0→1`
- Focus trap dentro da paleta enquanto aberta (Radix FocusScope)
- Ao fechar: devolve foco ao elemento que estava focado antes da abertura

---

## Estados e Edge Cases

### Sem projeto aberto

- Modo Agentes: mostra mensagem "Nenhum projeto aberto — use 'Abrir projeto' para começar"
- Ação "Fechar projeto" desabilitada (aparece mas com `aria-disabled` e estilo muted)
- Ação "Salvar cenário" desabilitada (canvas vazio não tem o que salvar)

### Nenhum resultado na busca

- Lista vazia com mensagem: "Nenhum resultado para '{query}'"
- Sugere limpar o filtro ou mudar o modo
- Nunca mostra spinner eterno — timeout de 2s para considerar "sem resultados"

### Falha ao executar ação

- Toast de erro com mensagem do backend (ex: "Falha ao invocar agente: catálogo não encontrado")
- Paleta **não** fecha automaticamente — usuário pode tentar novamente
- Log de erro no console com `console.error('[CommandPaletteGlobal]', error)`

### Projeto com 0 agentes no catálogo

- Modo Agentes mostra: "Nenhum agente encontrado em {projectPath}" + link "Ver como adicionar agentes"
- A ação "Invocar agente" continua disponível no Modo Ações mas abre esse estado informativo

### Cenários salvos

- Listados em ordem de última modificação (mais recente primeiro)
- Se `canvas_layouts` vazio: mensagem "Nenhum cenário salvo ainda"
- Limite visual: mostra até 10 cenários; scroll interno

---

## Tabela de Referência Rápida

| Modo | Prefixo | Tab order | Executa |
|------|---------|-----------|---------|
| Ações | (nenhum) | 1 | Ação direta ou sub-fluxo |
| Agentes | `/` | 2 | POST /api/agents/invoke |
| Comandos | `>` | 3 | Variável por comando |

| Tecla | Efeito |
|-------|--------|
| `⌘K` / `Ctrl+K` | Abre / fecha |
| `↑↓` | Navega lista |
| `↵` | Executa |
| `Esc` | Cancela / fecha |
| `Tab` | Muda modo |
| `⌘↵` | Executa como terminal (só Modo Agentes) |

| Ação | Backend |
|------|---------|
| Invocar agente | POST /api/agents/invoke |
| Criar conexão | POST /api/connections |
| Salvar cenário | PATCH /api/canvas/layout |
| Carregar cenário | GET /api/canvas/layout |
| Abrir projeto | POST /api/projects/open |
| Fechar projeto | POST /api/projects/close |
| Alternar tema | localStorage only |

---

*Rey, eyes on the horizon.*
