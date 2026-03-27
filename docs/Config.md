# Config — Contexto Funcional & Epic de Evolução

> **Autor:** Atlas (Analyst Agent) | **Data:** 2026-03-24 (atualizado)
> **Projeto:** aiox-monitor | **Branch:** main

---

## 1. Objetivo do Módulo Config

A aba Config (`/empresa/config`) é o **painel de administração central** do aiox-monitor. Centraliza todas as configurações que afetam o comportamento global do sistema — desde a aparência visual do escritório isométrico até os sistemas autônomos (Ganga Ativo e Autopilot), passando pela gestão de projetos registados.

Responde às perguntas:

- **Como personalizo** a visualização do escritório? (tema, skins, nome da empresa)
- **Como controlo** o comportamento dos agentes inativos? (timeouts lounge/break)
- **Como ativo/desativo** o modo autônomo Ganga? (auto-resposta a prompts seguros)
- **Como funciona o Autopilot?** (auto-approve per-terminal para pedidos de permissão)
- **Como limpo/removo** projetos e seus dados?

**Não é:** uma página de configuração técnica do servidor (portas, PM2, DB). É uma interface de **configuração funcional e visual** do produto.

---

## 2. Arquitetura Atual

### 2.1 Componentes

| Ficheiro | Responsabilidade |
|----------|-----------------|
| `src/app/empresa/config/page.tsx` | Página principal — formulário de configuração + gestão de projetos (452 linhas) |
| `src/app/api/company-config/route.ts` | API GET/PUT — leitura e escrita de configuração com validação (66 linhas) |
| `src/app/api/ganga/route.ts` | API GET — estado do Ganga Ativo (enabled, logs, stats) (22 linhas) |
| `src/app/api/terminals/autopilot/route.ts` | API GET/PATCH — status e toggle global do Autopilot (57 linhas) |
| `src/app/api/terminals/autopilot/log/route.ts` | API GET — logs do Autopilot com stats (17 linhas) |
| `src/app/api/projects/route.ts` | API GET — lista de projetos com stats opcionais |
| `src/app/api/projects/[id]/route.ts` | API GET/DELETE — detalhes ou remoção de projeto (cascade) |
| `src/app/api/projects/[id]/events/route.ts` | API DELETE — limpar eventos/sessões de um projeto |
| `src/game/data/skin-config.ts` | Definições de skins (10 aliens + 10 animais) + localStorage persistence |
| `src/game/data/pixellab-sprites.ts` | Sprites PixelLab por agente (direções, preview) |
| `src/game/data/themes.ts` | 4 temas visuais com paletas completas de cores |
| `src/game/bridge/react-phaser-bridge.ts` | Bridge React → Phaser (`setTheme()` para preview imediato) |

### 2.2 Subsistemas

#### A. Company Config (Singleton DB)

```
company_config (id=1)
├── name: string              — Nome da empresa exibido no escritório
├── logo_path: string | null  — [NÃO USADO NA UI] Caminho para logo
├── theme: ThemeName          — Tema visual activo (moderno/espacial/oldschool/cyberpunk)
├── ambient_music: 0 | 1      — Toggle de música ambiente
├── idle_timeout_lounge: int   — Segundos até working → lounge (60-1800s)
├── idle_timeout_break: int    — Segundos até lounge → café (300-3600s)
├── event_retention_days: int  — [NÃO EXPOSTO NA UI] Dias de retenção de eventos (default: 30)
├── ganga_enabled: 0 | 1      — Toggle do sistema Ganga Ativo
├── ganga_scope: GangaScope   — Escopo de auto-resposta (safe-only / safe-and-ambiguous)
└── updated_at: string        — Timestamp da última actualização
```

#### B. Autopilot Engine (Per-Terminal, Novo)

Sistema que monitoriza terminais com `autopilot=1` e `waiting_permission=1`, enviando aprovação automática ("y") via JXA/osascript (iTerm2).

| Ficheiro | Papel |
|----------|-------|
| `src/server/autopilot-engine.ts` | Motor principal — ciclo de **3s**, envio de aprovação via JXA, cooldown de 8s por terminal, logging (225 linhas) |

**Fluxo do ciclo Autopilot:**

```
tick() [cada 3s]
  ├─ getAutopilotTerminals()
  │   └─ Query: autopilot=1 AND status != 'inactive' AND waiting_permission=1
  │
  ├─ Para cada terminal candidato:
  │   ├─ Cooldown check (8s por terminal, evita double-tapping)
  │   ├─ findSessionTty(pid)
  │   │   └─ Walk up process tree (PID → PPID → GPPID) para encontrar
  │   │      o TTY da sessão iTerm2 (necessário porque `script` aloca um novo pty)
  │   │
  │   ├─ sendApprovalToSession(tty)
  │   │   └─ JXA (JavaScript for Automation): percorre windows/tabs/sessions
  │   │      do iTerm2, encontra sessão pelo TTY, envia sess.write({text: 'y'})
  │   │
  │   ├─ [Se enviado] UPDATE terminals SET waiting_permission=0
  │   ├─ [Se enviado] insertAutopilotLog(permission_approve)
  │   ├─ [Se enviado] broadcast('terminal:update') + broadcast('autopilot:action')
  │   └─ [Se falhou] insertAutopilotLog(error)
  │
  └─ cleanupCooldowns() [cada 60s, limpa entries > 16s]
```

**Diferença Autopilot vs Ganga:**

| Aspecto | Autopilot (novo) | Ganga Ativo (legado) |
|---------|-----------------|---------------------|
| Granularidade | Per-terminal (`autopilot` flag) | Global (`ganga_enabled` config) |
| Ciclo | 3 segundos | 5 minutos |
| Trigger | `waiting_permission=1` no DB | Detecção de prompts via regex |
| Resposta | Sempre "y" (apenas permissões) | Classificação: safe/blocked/ambiguous |
| Mecanismo | JXA direto (iTerm2 session) | AppleScript (keystroke) |
| Escopo | Apenas pedidos de permissão do Claude Code | Qualquer prompt (y/n, proceed?, etc.) |
| Toggle | Per-terminal ou bulk via API | Toggle global na Config |

#### C. Ganga Ativo (Motor Autônomo Legado)

Sistema que monitoriza terminais Claude Code a cada 5 minutos e auto-responde a prompts seguros.

| Ficheiro | Papel |
|----------|-------|
| `src/server/ganga/ganga-engine.ts` | Orquestrador — ciclo de 5 min, detecção de prompts, logging, heartbeat WS (237 linhas) |
| `src/server/ganga/prompt-matcher.ts` | Classificador — 58 padrões safe, 18 blocked, regex-based (131 linhas) |
| `src/server/ganga/auto-responder.ts` | Executor — envia keystrokes via AppleScript (iTerm2/Terminal.app) (102 linhas) |

**Fluxo do ciclo Ganga:**

```
runGangaCycle() [cada 5 min]
  ├─ getCompanyConfig() → verificar ganga_enabled
  ├─ findPendingPrompts()
  │   ├─ Query terminais (processing/active) com agent
  │   ├─ Último evento por terminal (< 10 min)
  │   ├─ Verificar question indicators (?, y/n, proceed?)
  │   └─ Verificar cooldown (não auto-respondido nos últimos 5 min)
  │
  ├─ Para cada candidato:
  │   ├─ classifyPrompt(output)
  │   │   ├─ BLOCKED → log, não responde (delete, force-push, sudo, .env, etc.)
  │   │   ├─ SAFE → suggestedResponse ("y", "yes", "sim", etc.)
  │   │   └─ AMBIGUOUS → log, não responde (a menos que scope = safe-and-ambiguous)
  │   │
  │   ├─ [Se SAFE] isProcessAlive(pid) → sendResponse(pid, response) → AppleScript
  │   └─ insertGangaLog()
  │
  └─ buildHeartbeat() → broadcast('ganga:heartbeat', summary)
```

**Classificação de padrões:**
- **Safe (58):** `(y/n)`, `proceed?`, `continue?`, `create.*file?`, `install.*dependencies?`, `overwrite?`, etc.
- **Blocked (18):** `delete`, `force.?push`, `rm\s+-rf`, `password`, `sudo`, `push.*main`, `deploy`, `.env`, etc.
- **Ambiguous:** Tem `?` mas não matcha safe nem blocked

#### D. Sistema de Skins

```
SKIN_STORAGE_KEY = 'aiox-skin-config' (localStorage)
├── Alien Skins (10): zyx, nebula, blip, blorp, nyx, pip, xara, ruk, flux, zara
├── Animal Skins (10): cat, dog, panda, fox, lion, wolf, penguin, owl, horse, rabbit
└── Cada skin: 4 PNGs direcionais ({basePath}-{south|north|east|west}.png)

PIXELLAB_SPRITES (novo)
└── Mapeamento agente → sprite PixelLab com direções (south/north/east/west)
    Usado na Config para preview do agente default quando sem skin override
```

**Problema:** Skins são persistidas apenas em localStorage do browser, não no servidor. Não sincronizam entre browsers/dispositivos.

#### E. Sistema de Temas

```
4 temas com paleta completa:
├── moderno    — Dark blue, cyan glow, neutro (#08090f)
├── espacial   — Deep space, bright cyan, saturado (#040610)
├── oldschool  — Brown/wood, green monochrome CRT (#1a1808)
└── cyberpunk  — Near black, magenta/pink neon (#050508)
```

**Fluxo de aplicação:**
1. User seleciona tema na UI → `setTheme(theme)` via bridge → Phaser redraw imediato
2. User clica "Guardar" → `PUT /api/company-config` → DB update → broadcast `theme:change`
3. Todos os clients WS conectados recebem → redraw sincronizado

### 2.3 Fluxo de Dados Completo

```
CONFIG PAGE (React)
    │
    ├─ Load:
    │   ├─ GET /api/company-config → config state
    │   ├─ localStorage('aiox-skin-config') → skinConfig state
    │   └─ GET /api/projects?stats=1 → projects[] state
    │
    ├─ Save:
    │   ├─ PUT /api/company-config → DB update
    │   │   ├─ broadcast('theme:change') [se tema mudou]
    │   │   └─ broadcast('ganga:toggle') [se ganga mudou]
    │   └─ saveSkinConfig() → localStorage
    │
    ├─ Project Actions:
    │   ├─ DELETE /api/projects/{id} → cascata completa (project + agents + terminals + sessions + events)
    │   └─ DELETE /api/projects/{id}/events → limpa eventos + sessões (mantém projeto + agentes)
    │
    └─ WebSocket (real-time):
        ├─ project:update → loadProjectsDebounced() (500ms)
        ├─ event:new → loadProjectsDebounced() (500ms) [removido — só project:update agora]
        └─ agent:update → loadProjectsDebounced() (500ms) [removido — só project:update agora]

AUTOPILOT ENGINE (Server-side, independente da Config page)
    │
    ├─ tick() [cada 3s]
    │   └─ getAutopilotTerminals() → processTerminal() → broadcast('terminal:update', 'autopilot:action')
    │
    └─ APIs (consultáveis pela UI de Terminais):
        ├─ GET /api/terminals/autopilot → status summary + terminal list
        ├─ PATCH /api/terminals/autopilot → toggle global (all active terminals)
        └─ GET /api/terminals/autopilot/log → logs + stats (24h)
```

### 2.4 API Contracts

| Endpoint | Método | Body/Params | Response | Validação |
|----------|--------|-------------|----------|-----------|
| `/api/company-config` | GET | — | `CompanyConfig` | — |
| `/api/company-config` | PUT | `{ name, theme, ambient_music, idle_timeout_*, ganga_* }` | `CompanyConfig` | theme IN 4 valores, timeouts com bounds, ganga_enabled 0\|1, ganga_scope 2 valores |
| `/api/ganga` | GET | — | `{ enabled, scope, logs[], stats }` | — |
| `/api/terminals/autopilot` | GET | — | `{ total, on, off, waiting, stats, terminals[] }` | — |
| `/api/terminals/autopilot` | PATCH | `{ enabled: boolean }` | `{ updated, autopilot }` | enabled must be boolean |
| `/api/terminals/autopilot/log` | GET | `?limit=N` | `{ logs: AutopilotLog[], stats }` | limit max 200 |
| `/api/projects` | GET | `?stats=1` | `Project[]` (com event/agent/session counts) | — |
| `/api/projects/{id}` | GET | — | `ProjectWithDetails` (agents + terminals) | id numérico |
| `/api/projects/{id}` | DELETE | — | `{ success: true }` | id numérico, projecto existe |
| `/api/projects/{id}/events` | DELETE | — | `{ success, events, sessions }` | id numérico |

---

## 3. Estado Atual da Implementação

### 3.1 Funcionalidades Completas

| Feature | Status | Notas |
|---------|--------|-------|
| Nome da empresa (input texto) | OK | Sem validação client-side (API aceita qualquer string) |
| Seleção de tema (4 opções) | OK | Preview imediato via bridge Phaser, persist em DB |
| Timeouts de inatividade (2 sliders) | OK | Sliders enforçam bounds, API valida |
| Toggle música ambiente | OK | Binary on/off, persist em DB |
| Toggle Ganga Ativo | OK | Ativa/desativa motor de 5 min, mostra scope e heartbeat info |
| Lista de projetos com stats | OK | Real-time via WS debounced |
| Limpar eventos de projeto | OK | Com diálogo de confirmação |
| Apagar projeto completo | OK | Com diálogo de confirmação + cascade |
| Skins de agentes (dropdowns) | OK | 20 skins alternativas, preview 8x8 com sprite PixelLab como default |
| Loading skeleton | OK | Shimmer animation enquanto carrega |
| Toast notifications | OK | Auto-dismiss 3s, success/error styles |
| Responsive layout | OK | 2-col desktop, 1-col mobile |
| Autopilot Engine (server-side) | OK | Ciclo de 3s, per-terminal, JXA/iTerm2, cooldown 8s, logging |
| Autopilot API (GET/PATCH + logs) | OK | Status summary, toggle global, logs com stats |

### 3.2 Funcionalidades Parciais ou Incompletas

| Feature | Estado | Gap |
|---------|--------|-----|
| Ganga scope switcher | **Schema existe, UI apenas exibe** | `ganga_scope` mostrado como texto informativo, mas não há toggle na Config para alternar safe-only ↔ safe-and-ambiguous |
| Autopilot UI na Config | **Inexistente** | O Autopilot é controlável via API e possivelmente na aba Terminais, mas não tem secção dedicada na Config |
| Autopilot logs viewer na Config | **API existe, UI não na Config** | `GET /api/terminals/autopilot/log` retorna logs + stats, mas não há visualização na Config |
| Logo upload | **Schema existe, UI não** | `logo_path` no DB, nenhuma UI para upload ou display |
| Event retention config | **Schema existe, UI não** | `event_retention_days` no DB (default 30), sem slider/input na UI |
| Ganga logs viewer | **API existe, UI não** | `GET /api/ganga` retorna logs + stats, mas nenhuma UI para visualizar |
| Skin preview ampliado | **Mínimo** | Preview 8x8px no dropdown (sprite PixelLab como default), sem preview maior ou animação |
| Theme preview visual | **Apenas texto** | Mostra descrição textual, sem miniatura do tema |
| Undo/Revert | **Inexistente** | Sem botão para reverter mudanças antes de guardar |
| Config history/audit | **Inexistente** | Sem log de quem/quando mudou configurações |

### 3.3 Warnings de Build (Activos)

```
src/app/empresa/config/page.tsx:
  - 'SkinDefinition' is imported but only used as type (minor)
  - 'SKIN_OPTIONS' is assigned a value but never used
  - 2x <img> warnings (should use next/image)
```

---

## 4. Gaps & Riscos

### 4.1 Gaps Funcionais

| # | Gap | Severidade | Impacto |
|---|-----|-----------|---------|
| G1 | **Ganga scope não controlável na UI** | Alta | User não consegue mudar escopo sem acesso direto à DB |
| G2 | **Ganga logs invisíveis na Config** | Alta | Auto-respostas acontecem sem visibilidade — sistema "caixa preta" |
| G3 | **Skins em localStorage** | Média | Perdem-se ao limpar browser; não sincronizam entre dispositivos |
| G4 | **Event retention não configurável** | Média | User não controla quanto tempo os dados persistem |
| G5 | **Logo nunca implementado** | Baixa | Campo existe no schema, dead code |
| G6 | **Sem validação client-side** | Baixa | Sliders já limitam ranges, mas nome aceita strings vazias |
| G7 | **Sem feedback de Ganga em tempo real na Config** | Média | O heartbeat WS existe mas a Config não o exibe |
| G8 | **Autopilot sem secção na Config** | Média | O Autopilot é controlável via API mas não tem visibilidade unificada na página Config |
| G9 | **Dois sistemas autônomos sem unificação** | Baixa | Ganga (global, regex-based) e Autopilot (per-terminal, permission-based) coexistem com escopos diferentes mas sem visão unificada |

### 4.2 Riscos Técnicos

| # | Risco | Probabilidade | Mitigação |
|---|-------|--------------|-----------|
| R1 | **JXA injection via autopilot-engine** | Baixa | TTY é derivado de `ps` output — alphanum; mas futuras extensões devem sanitizar |
| R2 | **Ganga responde a prompt errado** | Média | Classificação regex-based pode ter falsos positivos; sem override manual |
| R3 | **Sem rate-limiting na API PUT** | Baixa | Rapid clicks podem triggerar múltiplos saves (sem debounce no botão) |
| R4 | **Cascade DELETE sem soft-delete** | Média | Apagar projeto é irreversível, sem arquivo/trash |
| R5 | **Sem CSRF protection** | Baixa | Localhost-only mitiga, mas se exposto na rede é vulnerável |
| R6 | **Build warnings acumulados** | Baixa | Warnings (unused SKIN_OPTIONS, img vs Image) — não bloqueia mas indica technical debt |
| R7 | **Autopilot double-tap** | Baixa | Cooldown de 8s mitiga, mas em cenários de restart rápido do engine o cooldown perde-se (in-memory) |

### 4.3 Riscos de UX

| # | Risco | Impacto |
|---|-------|---------|
| U1 | **Ganga é "invisível" na Config** | User ativa Ganga mas não vê o que está a acontecer (sem logs, sem histórico, sem indicador de atividade recente) |
| U2 | **Tema sem preview** | User tem de experimentar cada tema para saber como fica — friction alta |
| U3 | **Config page longa** | No mobile, o scroll é extenso (settings + projects + skins = muitas secções) |
| U4 | **Sem confirmação ao sair sem guardar** | User pode perder mudanças ao navegar para outra página |
| U5 | **Relação Autopilot ↔ Ganga confusa** | User pode não entender quando usar cada sistema autônomo |

---

## 5. Dependências

### 5.1 Dependências Internas

| Módulo Config depende de → | Para |
|---------------------------|------|
| `src/lib/queries.ts` | Todas as queries DB (getCompanyConfig, updateCompanyConfig, getProjects, deleteProject, setTerminalAutopilot, getAutopilotTerminals, getAutopilotLogs, getAutopilotStats, etc.) |
| `src/lib/schema.ts` | Definição das tabelas `company_config`, `autopilot_log`, `ganga_log` + migrações |
| `src/lib/types.ts` | `CompanyConfig`, `ThemeName`, `GangaScope`, `Project`, `GangaLog`, `AutopilotLog`, `AutopilotAction` |
| `src/server/ws-broadcaster.ts` | Broadcast de `theme:change`, `ganga:toggle`, `terminal:update`, `autopilot:action` |
| `src/server/autopilot-engine.ts` | Motor Autopilot (ciclo 3s, JXA, cooldown) |
| `src/server/ganga/*` | Motor Ganga Ativo (engine, matcher, responder) |
| `src/game/data/themes.ts` | Paletas dos 4 temas |
| `src/game/data/skin-config.ts` | Definições + storage de skins (localStorage) |
| `src/game/data/pixellab-sprites.ts` | Sprites PixelLab por agente (preview default na Config) |
| `src/game/bridge/react-phaser-bridge.ts` | `setTheme()` para preview imediato |
| `src/hooks/useWebSocket.ts` | Real-time updates de projetos |

### 5.2 Dependências Externas

| Dependência | Uso |
|-------------|-----|
| **next** | App Router, API routes |
| **react** | UI components, hooks |
| **ws** | WebSocket broadcasts |
| **node:sqlite** | Persistência de configuração |
| **node:child_process** | Autopilot: `execFile` para osascript/JXA e `ps` |
| **osascript/JXA** (macOS) | Autopilot: envio de "y" para sessões iTerm2 |
| **AppleScript** (macOS) | Ganga auto-responder (iTerm2/Terminal.app) |

### 5.3 Quem Depende do Config

| Módulo → depende de Config | Para |
|---------------------------|------|
| `src/server/idle-detector.ts` | Lê `idle_timeout_lounge` e `idle_timeout_break` para transições de status |
| `src/server/ganga/ganga-engine.ts` | Lê `ganga_enabled` e `ganga_scope` a cada ciclo |
| `src/server/autopilot-engine.ts` | Lê `autopilot` flag dos terminais (per-terminal, não da company_config) |
| `src/server/cleanup.ts` | Lê `event_retention_days` para purge de eventos antigos |
| `src/game/scenes/OfficeScene.ts` | Recebe `theme:change` via bridge para redraw |
| `src/components/empresa/PhaserGame.tsx` | Fetch config no init para tema inicial |
| Todos os clients WS | Recebem `theme:change`, `ganga:toggle`, `autopilot:action` broadcasts |

---

## 6. Proposta de Epic: Config Evolution

### 6.1 Escopo

**Epic ID:** E-CONFIG
**Título:** Config Module — Feature Completion & Observability
**Objetivo:** Completar as funcionalidades parciais do módulo Config, dar visibilidade ao Ganga Ativo e Autopilot, e resolver gaps de UX que impedem o user de ter controlo total sobre o sistema.

**Fora de escopo:**
- Autenticação / multi-user (o sistema é local, single-user)
- Config remota / sync cloud
- Novos temas visuais (os 4 actuais são suficientes)
- Geração de novas skins (usa PixelLab externamente)
- Fusão Ganga + Autopilot (são sistemas com escopos distintos)

### 6.2 Critérios de Sucesso

| # | Critério | Métrica |
|---|----------|---------|
| CS1 | Todas as settings do schema são controláveis via UI | 0 campos orphan no DB sem representação na UI |
| CS2 | Ganga Ativo tem visibilidade total | User consegue ver logs, stats, e último heartbeat sem aceder à DB |
| CS3 | Zero warnings de build no módulo Config | `npm run build` sem warnings em config/page.tsx |
| CS4 | Skins persistem no servidor | Skins sobrevivem a clear de browser e são consistentes entre dispositivos |
| CS5 | Feedback visual antes de guardar | User sabe que tem mudanças pendentes |
| CS6 | Autopilot tem visibilidade na Config | User vê stats e logs recentes do Autopilot na Config |

### 6.3 Stories Derivadas

#### Story C.1 — Ganga Dashboard (Alta Prioridade)

**Objetivo:** Dar visibilidade total ao sistema Ganga Ativo dentro da Config.

**Scope:**
- Exibir últimos 20 logs de Ganga na Config (prompt, classificação, ação, timestamp)
- Mostrar stats do último ciclo (auto-responses, blocked, skipped)
- Indicador de "último heartbeat" com tempo relativo
- Exibir ganga_scope como toggle na UI (safe-only ↔ safe-and-ambiguous)

**AC:**
- [ ] Secção "Ganga Dashboard" na Config com logs recentes
- [ ] Badge com contadores: auto-respondidos / bloqueados / ignorados (24h)
- [ ] Toggle de scope (safe-only / safe-and-ambiguous) funcional e persistido
- [ ] Indicador de último heartbeat com TimeAgo
- [ ] Dados atualizam em real-time via WS `ganga:heartbeat`

**Dependências:** GET /api/ganga (já existe), WS ganga:heartbeat (já existe)

---

#### Story C.1b — Autopilot Dashboard na Config (Alta Prioridade)

**Objetivo:** Dar visibilidade ao sistema Autopilot dentro da Config.

**Scope:**
- Secção "Autopilot" na Config com status summary (on/off/waiting)
- Exibir últimos logs de autopilot (terminal, ação, detalhe, timestamp)
- Stats das últimas 24h (approved, errors, skipped)
- Toggle global de autopilot (liga/desliga todos os terminais activos)

**AC:**
- [ ] Secção "Autopilot" na Config com status resumido
- [ ] Lista de últimas 10 acções do autopilot
- [ ] Badge com contadores: approved / errors / skipped (24h)
- [ ] Toggle global que chama `PATCH /api/terminals/autopilot`
- [ ] Dados atualizam via WS `autopilot:action`

**Dependências:** `GET/PATCH /api/terminals/autopilot` (já existe), `GET /api/terminals/autopilot/log` (já existe)

---

#### Story C.2 — Skins Server-Persisted (Média Prioridade)

**Objetivo:** Migrar skins de localStorage para DB (company_config ou tabela dedicada).

**Scope:**
- Nova coluna `skin_assignments` (JSON text) na tabela `company_config`
- API PUT /api/company-config aceita campo `skins`
- Config page lê/escreve skins via API em vez de localStorage
- Migração automática: se localStorage tem skins e DB não, migrar no primeiro save

**AC:**
- [ ] Schema migration adiciona `skin_assignments TEXT DEFAULT '{}'` a company_config
- [ ] PUT /api/company-config aceita e valida campo `skins` (JSON de agentName→skinId)
- [ ] Config page usa API para load/save skins
- [ ] Migração localStorage → DB no primeiro save (fallback gracioso)
- [ ] localStorage fallback removido após migração

**Dependências:** Schema migration

---

#### Story C.3 — Event Retention Config (Média Prioridade)

**Objetivo:** Expor `event_retention_days` na UI.

**Scope:**
- Slider ou input numérico para event_retention_days (range: 7-365 dias)
- Exibir espaço ocupado estimado (count de eventos)
- Botão "Limpar agora" para forçar cleanup manual

**AC:**
- [ ] Input de retention days na secção de settings (7-365, step 1)
- [ ] Display do total de eventos e idade do mais antigo
- [ ] Botão "Limpar agora" que trigga cleanupOldEvents() sob demanda
- [ ] Validação API: retention_days entre 7 e 365

**Dependências:** cleanupOldEvents() (já existe)

---

#### Story C.4 — Dirty State & UX Polish (Baixa Prioridade)

**Objetivo:** Melhorar a experiência de edição de configurações.

**Scope:**
- Detectar "dirty state" (mudanças não guardadas)
- Indicador visual no botão Guardar quando há mudanças
- Confirmação ao navegar sem guardar (beforeunload)
- Debounce no botão Guardar (prevenir duplo-click)
- Resolver build warnings

**AC:**
- [ ] Botão "Guardar" muda de cor/estado quando há mudanças pendentes
- [ ] `beforeunload` event listener quando dirty
- [ ] Debounce de 500ms no handleSave (ou disable durante save)
- [ ] 0 warnings de build nos ficheiros do módulo Config
- [ ] `SKIN_OPTIONS` removido ou usado

**Dependências:** Nenhuma

---

#### Story C.5 — Logo & Branding (Baixa Prioridade)

**Objetivo:** Implementar upload de logo da empresa.

**Scope:**
- Input de file upload na Config (aceita PNG/SVG, max 200KB)
- Preview do logo no formulário
- Guardar logo em `public/uploads/` (ou base64 no DB)
- Exibir logo no header do escritório isométrico

**AC:**
- [ ] File input com preview na Config
- [ ] Upload + persistência (file ou base64)
- [ ] Logo visível no escritório Phaser (posição configurável)
- [ ] Fallback para nome da empresa quando sem logo

**Dependências:** Modificação no OfficeScene.ts

---

### 6.4 Prioridade de Implementação

| Prioridade | Story | Impacto | Esforço | Justificação |
|:---:|-------|---------|---------|-------------|
| 1 | **C.1** Ganga Dashboard | Alto | Médio | O Ganga é a feature mais poderosa mas é completamente invisível — risco operacional |
| 2 | **C.1b** Autopilot Dashboard | Alto | Baixo | APIs já existem, só falta a UI — o Autopilot funciona silenciosamente |
| 3 | **C.4** Dirty State & Polish | Médio | Baixo | Quick wins que melhoram UX e eliminam tech debt |
| 4 | **C.2** Skins Server-Persisted | Médio | Médio | Dados perdem-se com clear de browser — fiabilidade |
| 5 | **C.3** Event Retention | Baixo | Baixo | Campo existe, só precisa de UI |
| 6 | **C.5** Logo & Branding | Baixo | Médio | Nice-to-have, não bloqueia nada |

---

## 7. Mapa de Ficheiros do Módulo

```
src/
├── app/empresa/config/
│   └── page.tsx                          ★ PÁGINA PRINCIPAL (452 linhas)
├── app/api/
│   ├── company-config/route.ts           ★ API CONFIG (GET/PUT, 66 linhas)
│   ├── ganga/route.ts                    ★ API GANGA (GET, 22 linhas)
│   ├── terminals/autopilot/
│   │   ├── route.ts                      ★ API AUTOPILOT (GET/PATCH, 57 linhas)
│   │   └── log/route.ts                  ★ API AUTOPILOT LOGS (GET, 17 linhas)
│   └── projects/
│       ├── route.ts                      ★ LISTA PROJETOS
│       └── [id]/
│           ├── route.ts                  ★ GET/DELETE PROJETO
│           └── events/route.ts           ★ CLEAR EVENTOS
├── server/
│   ├── autopilot-engine.ts               ★ MOTOR AUTOPILOT (225 linhas) — NOVO
│   └── ganga/
│       ├── ganga-engine.ts               ★ MOTOR GANGA (237 linhas)
│       ├── prompt-matcher.ts             ★ CLASSIFICADOR (131 linhas)
│       └── auto-responder.ts             ★ EXECUTOR APPLESCRIPT (102 linhas)
├── game/data/
│   ├── skin-config.ts                    ★ SKINS (20 opções)
│   ├── pixellab-sprites.ts               ★ SPRITES PIXELLAB (previews por agente) — NOVO
│   └── themes.ts                         ★ TEMAS (4 paletas)
├── game/bridge/
│   └── react-phaser-bridge.ts            ★ setTheme() BRIDGE
├── lib/
│   ├── types.ts                          CompanyConfig, ThemeName, GangaScope, AutopilotLog, AutopilotAction
│   ├── queries.ts                        Queries DB (get/update config, projects, ganga logs, autopilot CRUD)
│   └── schema.ts                         DDL company_config + autopilot_log + ganga_log + migrations
└── hooks/
    └── useWebSocket.ts                   WS hook (project:update, autopilot:action, ganga:heartbeat)
```

---

*— Atlas, investigando a verdade 🔎*
