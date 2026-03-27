# Empresa — Contexto Funcional, Status & Roadmap

> **Autor:** Atlas (Analyst Agent) | **Data:** 2026-03-24 (rev.2)
> **Projeto:** aiox-monitor | **Branch:** main
> **Revisão anterior:** 2026-03-18

---

## 1. Objetivo do Módulo

A aba Empresa (`/empresa`) é a **representação visual imersiva** do sistema aiox-monitor. Renderiza um escritório isométrico em pixel art (Phaser.js) onde cada agente AI é um personagem animado que se movimenta entre mesas de trabalho e áreas de recreação conforme o seu estado operacional.

**Perguntas que responde:**

- Quais projetos estão ativos e quantos agentes estão a trabalhar em cada um?
- Que agentes estão a trabalhar, em pausa, ou inativos — e onde estão fisicamente?
- Que ferramenta cada agente está a usar neste momento?
- Algum agente está bloqueado à espera de permissão?
- Algum terminal está em modo autopilot?

**O que NÃO é:** Não é um gestor de tarefas nem um IDE visual. É um **monitor de workforce AI** com representação espacial.

---

## 2. Arquitetura

### 2.1 Stack Técnica

| Camada | Tecnologia | Ficheiro Principal |
|--------|------------|-------------------|
| Rendering | Phaser.js 3.x (Canvas 2D) | `src/game/scenes/OfficeScene.ts` |
| Bridge React↔Phaser | Event emitter custom | `src/game/bridge/react-phaser-bridge.ts` |
| React Wrapper | Next.js dynamic import (SSR disabled) | `src/components/empresa/PhaserGame.tsx` |
| Dados em tempo real | WebSocket + REST polling | `src/hooks/useWebSocket.ts` |
| Backend | SQLite + custom server | `src/lib/queries.ts`, `server.ts` |
| Autopilot | Engine + JXA (osascript) | `src/server/autopilot-engine.ts` |
| Configuração | Singleton DB row + localStorage | `src/app/empresa/config/page.tsx` |

### 2.2 Fluxo de Dados

```
Eventos (Hook Python / JSONL Watcher)
    ↓
event-processor.ts → agent-tracker.ts → terminal-tracker.ts
    ↓
SQLite (agents, terminals, projects, autopilot_log)
    ↓
WebSocket broadcast (agent:update, terminal:update, event:new, theme:change, ganga:toggle)
    ↓
PhaserGame.tsx (React)
    ├── Init: fetchAndSync() — 3 endpoints (agents + projects + config)
    ├── agent:update       → updateAgent() directo (zero HTTP)
    ├── terminal:update    → throttled fetchAgentsOnly() (2s debounce, 1 HTTP)
    ├── event:new          → throttled fetchAgentsOnly() (2s debounce, 1 HTTP)
    ├── theme:change       → setTheme() directo
    └── Reconnect          → fetchAndSync() full
    ↓
react-phaser-bridge.ts → emitToGame()
    ↓
OfficeScene.ts
    ├── sync:projects → AgentManager.syncProjects()
    ├── sync:agents   → AgentManager.syncAll()
    ├── update:agent  → AgentManager.updateAgent()
    └── set:theme     → OfficeScene.setTheme()
    ↓
AgentManager → ClusterManager → AgentSprite / Desk
```

### 2.3 Mapa do Escritório (36×26 tiles isométricos)

```
┌─────────────────────────────────────────────────────────┐
│  ZONA DE TRABALHO (tileX:17-34, tileY:1-21)            │
│  ┌────────────┐ ┌────────────┐                          │
│  │ Cluster 0  │ │ Cluster 3  │  (tileY:2)              │
│  │ [12 mesas] │ │ [12 mesas] │                          │
│  ├────────────┤ ├────────────┤                          │
│  │ Cluster 1  │ │ Cluster 4  │  (tileY:8)              │
│  │ [12 mesas] │ │ [12 mesas] │                          │
│  ├────────────┤ ├────────────┤                          │
│  │ Cluster 2  │ │ Cluster 5  │  (tileY:14)             │
│  │ [12 mesas] │ │ [12 mesas] │                          │
│  └────────────┘ └────────────┘                          │
├────────────────────┬────────────────────────────────────┤
│  RECREAÇÃO (1-15,1-17)                                  │
│  ┌──────────┬──────────┐                                │
│  │  JOGOS   │  GAMER   │                                │
│  │PingPong  │ Arcades  │                                │
│  │Sinuca    │ Gaming   │                                │
│  ├──────────┼──────────┤                                │
│  │  REDES   │ LOUNGE   │                                │
│  │Hammocks  │ Sofás    │                                │
│  │Massagem  │ Café     │                                │
│  └──────────┴──────────┘                                │
├─────────────────────┬───────────────────────────────────┤
│  BEDROOM (1-8,18-25)│  ENTRADA (10-20,19-25)            │
│  Camas + NightStands│  Porta + Plantas                  │
└─────────────────────┴───────────────────────────────────┘
```

### 2.4 Ciclo de Vida Visual dos Agentes

```
STATUS      LOCALIZAÇÃO              COMPORTAMENTO
─────────── ────────────────────── ──────────────────────────
working   → Mesa no cluster        Sentado, teclar, monitor ON
idle      → Zona de recreação      Em pé, wander a cada 8s
break     → Zona de recreação      Relaxando (hammock, café, etc.)
offline   → Walk até entrada       Efeito Matrix despawn, remove sprite
```

Transições são animadas: walk entre zonas, sit/stand, spawn/despawn effects (digital rain).

### 2.5 Autopilot Engine (novo desde rev.1)

```
Ciclo: 3s polling
    ↓
getAutopilotTerminals() — terminais com autopilot=1 AND waiting_permission=1
    ↓
sendApprovalToSession(tty) — JXA osascript → iTerm2 "y" + Enter
    ↓
insertAutopilotLog() → broadcast('autopilot:approved')
    ↓
Cooldown: 8s por terminal (evita double-tap)
```

O autopilot é activado per-terminal via `POST /api/terminals/autopilot` e configurável globalmente via Ganga Ativo na config UI.

---

## 3. Inventário de Componentes

### 3.1 Frontend

| Ficheiro | LOC | Função |
|----------|-----|--------|
| `src/app/empresa/page.tsx` | ~15 | Página — dynamic import PhaserGame |
| `src/app/empresa/config/page.tsx` | 482 | Dashboard config (tema, skins, timeouts, Ganga, projetos) |
| `src/components/empresa/PhaserGame.tsx` | 131 | React wrapper — WS → fetch → bridge sync |
| `src/components/empresa/config/agent-colors.ts` | ~30 | Mapa de cores para config UI |

### 3.2 Game Engine

| Ficheiro | LOC | Complexidade | Função |
|----------|-----|-------------|--------|
| `src/game/scenes/BootScene.ts` | 157 | Média | Asset loading (PixelLab, skins, tiles, procedural) |
| `src/game/scenes/OfficeScene.ts` | 722 | Alta | Cena principal: floor, walls, furniture, camera, managers |
| `src/game/managers/AgentManager.ts` | 540 | Alta | Lifecycle de sprites: create, position, transition, wander |
| `src/game/managers/ClusterManager.ts` | 125 | Média | Clusters de mesas por projeto (12 mesas cada) |
| `src/game/objects/AgentSprite.ts` | 745 | Muito Alta | Sprite direcional, badges, labels, particles, effects |
| `src/game/objects/Desk.ts` | 262 | Alta | Mesa iMac com monitor, keyboard, código animado |
| `src/game/objects/` (17 mais) | ~1673 | Média | Sofa, Hammock, ArcadeMachine, GamingSetup, etc. |
| `src/game/config.ts` | ~30 | Simples | Configuração Phaser |

**Total game engine:** ~4581 LOC (36 ficheiros)

### 3.3 Data & Configuration

| Ficheiro | LOC | Função |
|----------|-----|--------|
| `src/game/data/office-layout.ts` | 208 | Layout: CLUSTER_ORIGINS (6 slots), RECREATION_POSITIONS (33), FURNITURE_POSITIONS |
| `src/game/data/themes.ts` | 129 | 4 temas: moderno, espacial, oldschool, cyberpunk (18+ props cada) |
| `src/game/data/agent-sprite-config.ts` | 125 | 12 configs visuais (cor, acessório, cabelo) |
| `src/game/data/agent-visuals.ts` | 25 | Cores Phaser + cores de status (duplica parcialmente sprite-config) |
| `src/game/data/pixellab-sprites.ts` | 75 | 11 agentes × 4 direções PixelLab |
| `src/game/data/skin-config.ts` | 86 | 20 skins alternativas (10 aliens + 10 animais) |
| `src/game/data/desk-sprites.ts` | — | 3 tamanhos de mesa (4, 12, 16 seats) |
| `src/game/data/floor-tiles.ts` | — | Texturas de chão por zona/tema |

### 3.4 Utilities & Bridge

| Ficheiro | LOC | Função |
|----------|-----|--------|
| `src/game/bridge/react-phaser-bridge.ts` | 39 | Comunicação React↔Phaser (syncAgents, syncProjects, setTheme) |
| `src/game/utils/iso-utils.ts` | — | Conversão tile↔pixel isométrica (2:1) |
| `src/game/utils/sprite-generator.ts` | 450 | Geração procedural de spritesheets (Canvas API) |
| `src/game/animations/agent-animations.ts` | 58 | Registro de animações (6 por agente: idle, walk×3, sit, type) |

### 3.5 Backend (relevante para Empresa)

| Ficheiro | LOC | Função |
|----------|-----|--------|
| `src/app/api/agents/route.ts` | — | GET agents (com `expand=terminals` para instâncias) |
| `src/app/api/company-config/route.ts` | — | GET/PUT config (tema, timeouts, Ganga) |
| `src/app/api/terminals/autopilot/route.ts` | — | POST toggle autopilot per-terminal |
| `src/app/api/terminals/autopilot/log/` | — | **Novo** — endpoint para log de aprovações autopilot |
| `src/lib/queries.ts` | — | `getAgentInstances()`, `getAgents()`, `getProjects()`, `getAutopilotTerminals()`, `insertAutopilotLog()` |
| `src/server/autopilot-engine.ts` | 224 | **Novo** — Engine autopilot: polling 3s, JXA → iTerm2, cooldown 8s |
| `src/server/idle-detector.ts` | — | Transições: working→idle→break→offline (30s loop) |
| `src/server/agent-tracker.ts` | — | Upsert agentes + status via eventos |
| `src/server/terminal-tracker.ts` | — | Terminal lifecycle (PID, window title, session, reactivation) |
| `src/server/jsonl-watcher.ts` | — | JSONL parsing: tool detail + permission detection |
| `src/server/ws-broadcaster.ts` | — | Broadcast WebSocket para todas as abas |

### 3.6 Schema (tabelas relevantes)

| Tabela | Campos-chave | Notas |
|--------|-------------|-------|
| `company_config` | `theme`, `ganga_enabled`, `ganga_scope`, `idle_timeout_lounge`, `idle_timeout_break`, `ambient_music` | Singleton (id=1) |
| `terminals` | `autopilot`, `waiting_permission`, `session_id`, `tty` | `autopilot` novo desde rev.1 |
| `autopilot_log` | `terminal_id`, `action`, `timestamp` | **Tabela nova** — regista aprovações automáticas |

---

## 4. Status Atual — O Que Existe e Funciona

### 4.1 Stories Entregues

| Story | Título | Status | ACs |
|-------|--------|--------|-----|
| 3.1 | Integração Phaser.js no Next.js | Done | 10/10 |
| 3.2 | Tilemap Isométrico (3 zonas) | Done | 10/10 |
| 3.3 | Sprites de Móveis (mesa, sofá, porta) | Done | 11/11 |
| 3.4 | Sprite Base de Personagem | Done | 9/9 |
| 3.5 | Animações walk/sit/type/idle | Done | 10/10 |
| 3.6 | Mesa Dinâmica (API → posição) | Done | 12/12 |
| 3.7 | Walk via WebSocket (real-time) | Done | 10/10 |
| 4.1 | Sprites Pixel Art por Agente | Done | 10/10 |
| 4.2 | Animações Completas de Transição | Done | 10/10 |
| 4.3 | Break Room Expandida (8 móveis novos) | Done | 10/10 |
| 4.4 | Sistema de Temas (4 temas) | Done | 10/10 |
| 4.5 | Personalização da Empresa (config UI) | Done | 10/10 |
| 6.1 | JSONL Transcript Intelligence | Done | 29/30 |
| 7.0 | PM2 Fast Restart — Node Directo | Done | — |

**Total: 14 stories entregues, 141/142 ACs.** AC26 (per-pixel matrix masking) diferido — requer WebGL shaders.

### 4.2 Funcionalidades Operacionais

- [x] Escritório isométrico com 4 zonas (trabalho, recreação, quarto, entrada)
- [x] 6 slots de cluster para projetos (12 mesas cada, total 72 workstations)
- [x] 18 tipos de mobília renderizados programaticamente (17 objects + Desk)
- [x] 11 agentes com sprites únicos (procedural + PixelLab)
- [x] 20 skins alternativas (10 aliens + 10 animais)
- [x] 4 temas visuais com hot-swap via WebSocket
- [x] Animações completas: walk, sit, type, idle, spawn, despawn
- [x] Wander system: agentes idle/break movem-se na recreação a cada 8s
- [x] Tool detail labels ("Running: npm test") via JSONL watcher
- [x] Permission bubble (amber) quando agente aguarda permissão
- [x] Camera pan/zoom com starfield parallax
- [x] Config UI: tema, skins, timeouts, empresa, Ganga Ativo
- [x] Multi-terminal support: múltiplas instâncias do mesmo agente via `expand=terminals`
- [x] Autopilot engine: aprovação automática via JXA/iTerm2 (per-terminal toggle)
- [x] Sync optimizado: `agent:update` directo sem HTTP, terminal/event throttled a 2s

### 4.3 Performance (melhorias desde rev.1)

| Métrica | rev.1 (2026-03-18) | Atual | Notas |
|---------|-------|-------|-------|
| HTTP requests por WS `agent:update` | 3 | **0** | Push directo via bridge |
| HTTP requests por WS `terminal:update` | 3 | **1** | Só agents, throttled 2s |
| HTTP requests por WS `event:new` | 3 | **1** | Só agents, throttled 2s |

---

## 5. Gaps Identificados

### 5.1 Gaps Funcionais (UX/Visual)

| # | Gap | Sev. | Detalhe | Status |
|---|-----|------|---------|--------|
| **G1** | **Separação entre projetos confusa** | CRITICAL | Clusters sem divisão visual — sem floor highlight, sem borda, sem cor por projeto. Labels de 11px alpha 0.7 quase invisíveis. Work zone inteira é bloco uniforme. | ABERTO |
| **G2** | **Mesas desaparecem** | HIGH | Clusters dependem de agentes ativos para existir. Projeto sem agentes momentâneos perde representação. | ABERTO |
| **G3** | ~~Performance lenta~~ | ~~HIGH~~ | ~~3 HTTP requests por WS event~~ | **PARCIALMENTE RESOLVIDO** — `agent:update` já é zero-HTTP; `terminal:update`/`event:new` reduzidos a 1 request throttled. Full re-fetch apenas no init/reconnect. |
| **G4** | **Atribuição de slots não-determinística** | MEDIUM | Slots atribuídos por ordem de chegada (first available). Projetos podem mudar de posição entre reloads. | ABERTO |
| **G5** | **Sem interação com agentes** | MEDIUM | Não é possível clicar num agente para ver detalhes (eventos, terminal, sessão). | ABERTO |
| **G6** | **Limite de 6 projetos silencioso** | LOW | Se >6 projetos ativos, excedentes ficam sem cluster sem feedback ao utilizador. | ABERTO |
| **G7** | ~~Sem indicação de multi-terminal~~ | ~~LOW~~ | ~~Mesmo agente com N terminais aparece como 1 sprite~~ | **RESOLVIDO** — `expand=terminals` cria instâncias separadas com IDs negativos sintéticos. |

### 5.2 Gaps Técnicos

| # | Gap | Sev. | Detalhe | Status |
|---|-----|------|---------|--------|
| **T1** | **Cores de agente duplicadas** | MEDIUM | `agent-sprite-config.ts` (125 LOC) e `agent-visuals.ts` (25 LOC) definem cores separadamente. Sem single source of truth. | ABERTO |
| **T2** | **Tween proliferation** | MEDIUM | Até 7 tweens por agente × 11 agentes = 77 tweens simultâneos. Sem pooling nem limite global. | ABERTO |
| **T3** | **BootScene carrega TUDO upfront** | MEDIUM | Todas as texturas de todos os temas + skins carregadas no boot. Sem lazy loading. | ABERTO |
| **T4** | **Magic numbers em AgentSprite** | LOW | ~20 hardcoded offsets (spriteY: -14, glow: 22, label: -48, badge: 16/-30, etc.) | ABERTO |
| **T5** | **Ganga scope UI vs. backend** | LOW | Config UI mostra "safe-only" vs "safe-and-ambiguous" mas backend usa `ganga_scope` — integração funcional mas não totalmente ligada ao autopilot. | ABERTO |
| **T6** | **Zero testes** | LOW | Nenhum teste para game engine, managers, ou objects. | ABERTO |
| **T7** | **Silent error swallowing** | LOW | BootScene catch blocks vazios. Falhas de textura invisíveis. | ABERTO |

### 5.3 Gaps de Backend

| # | Gap | Sev. | Detalhe | Status |
|---|-----|------|---------|--------|
| **B1** | **Idle detector loop em offline** | MEDIUM | Agentes offline continuam a ser avaliados no loop sem guard. | ABERTO |
| **B2** | ~~Terminal PID recycling~~ | ~~LOW~~ | ~~PID reciclado causa atribuição fantasma~~ | **EM RESOLUÇÃO** — Story 8.5 (session-aware upsert) em Ready for Review. |
| **B3** | **Agent heuristic false positives** | LOW | Pattern scanning do event-processor pode identificar agent names em código/comentários. | ABERTO |
| **B4** | **Autopilot log endpoint incompleto** | LOW | Directório `src/app/api/terminals/autopilot/log/` existe mas endpoint ainda não está tracked no git. | **NOVO** |

---

## 6. Riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|-------|-------|---------|-----------|
| R1 | **Performance degrada com scale** — mais projetos/agentes = mais objetos Phaser + network | Alta | Alto | Sync incremental (parcialmente implementado), lazy cluster creation, object pooling |
| R2 | **Projetos ficam visualmente misturados** — utilizador confunde agentes entre projetos | Alta | Alto | Separação visual obrigatória (floor, border, color, label) — **gap G1 aberto** |
| R3 | **Mesas desaparecem inesperadamente** — clusters removidos quando projetos ficam sem agentes | Média | Alto | Clusters ligados a projetos (DB), não a agentes — **gap G2 aberto** |
| R4 | **Stale state visual** — utilizador vê estado desatualizado se WS desligar silenciosamente | Média | Médio | Heartbeat check (30s ping), reconnection auto com full-refresh |
| R5 | **Memory leak em sessões longas** — tweens, particles, sprites acumulam sem cleanup | Baixa | Alto | Auditoria de destroy(), limites de tweens, object pooling |
| R6 | **PixelLab sprites 404** — skins referenciadas mas ficheiros ausentes no filesystem | Baixa | Baixo | Validação de texturas no BootScene com fallback procedural |
| R7 | **Autopilot aprova indevidamente** — JXA envia keystroke ao terminal errado | Baixa | Alto | Cooldown 8s, match por TTY, log para auditoria |

---

## 7. Dependências

### 7.1 Upstream (Empresa depende de)

| Componente | Detalhe | Risco se falhar |
|------------|---------|-----------------|
| `GET /api/agents?expand=terminals` | Instâncias de agentes por terminal | Escritório vazio |
| `GET /api/projects` | Lista de projetos para clusters | Sem clusters visíveis |
| `GET /api/company-config` | Tema, timeouts, ganga | Tema default, timeouts hardcoded |
| WebSocket `/ws` | Updates real-time | Escritório estático (só refresh manual) |
| `idle-detector.ts` | Transições working→idle→break→offline | Agentes ficam "stuck" no último estado |
| `jsonl-watcher.ts` | Tool detail + permission detection | Sem labels de ferramenta, sem bubbles |
| `autopilot-engine.ts` | Aprovação automática de permissões | Autopilot toggle sem efeito |
| Phaser.js 3.x | Game engine | Módulo inteiro inoperável |
| PixelLab sprites (`/public/sprites/`) | Texturas de agentes | Fallback procedural (menor qualidade) |

### 7.2 Downstream (quem depende do Empresa)

| Componente | Detalhe |
|------------|---------|
| Navbar | Link `/empresa` + `/empresa/config` |
| `ProjectSelector` | Filtra a vista por projeto selecionado |
| Theme system | Config UI broadcast afeta Empresa em tempo real |
| Autopilot system | Toggle per-terminal + Ganga global dependem da config |

### 7.3 Dependências Transversais

| Com | Tipo | Detalhe |
|-----|------|---------|
| Kanban (`/kanban`) | Shared state | Ambos usam `useWebSocket` + mesmas APIs. Risco de drift se lógica divergir |
| Lista (`/lista`) | Read-only | Lista mostra eventos que geram mudanças visuais na Empresa |
| Terminais (`/terminais`) | Data overlap | Terminais mostra tool_detail que Empresa renderiza como label; partilham autopilot toggle |

---

## 8. Epic 8 — Terminais: Deduplication, Session Matching & Operational Reliability

> **NOTA:** O Epic 8 foi reformulado desde a rev.1 deste documento. O escopo original ("Empresa 2.0: Clareza, Performance & Estabilidade") foi substituído por um epic focado em **fiabilidade do módulo Terminais**, que é a source of truth upstream da Empresa. Os gaps visuais (G1, G2, G4) identificados na secção 5 permanecem abertos e deverão ser endereçados num epic futuro.

### Visão

Garantir correspondência 1:1 entre sessões Claude Code reais e registos na tabela `terminals`, com enrichment JSONL fiável e dados observáveis — eliminando duplicados, dados cruzados e fantasmas.

### Stories

| Story | Título | Status | Wave | Depende |
|-------|--------|--------|------|---------|
| **8.1** | Fix Hyphenated Path Conversion in JSONL Watcher | Ready for Review | W1 (P0) | 7.0 |
| **8.2** | Eliminate "First Project" Fallback | Ready for Review | W1 (P0) | 7.0 |
| **8.3** | Improve JSONL-to-Terminal Matching Accuracy | Ready for Review | W2 (P1) | 8.1 |
| **8.4** | Session-Aware PID Deduplication | Ready for Review | W2 (P1) | 7.0 |
| **8.5** | Session-Aware Upsert — Reset on Session Change | Ready for Review | W2 (P1) | 7.0 |
| **8.6** | Frontend Terminal Removal via WebSocket | Draft | W3 (P2) | 7.0 |
| **8.7** | Terminal Health Observability Endpoint | Draft | W3 (P2) | 8.1, 8.3 |
| **8.8** | Unit Tests for Terminal Matching & Lifecycle | Draft | W3 (P2) | 8.1-8.5 |

### Impacto na Empresa

O Epic 8 beneficia a Empresa indirectamente:
- **Menos sprites fantasma** — terminais duplicados eliminados (8.4)
- **Tool detail correcto** — JSONL enrichment funcional para projectos com hifen (8.1, 8.3)
- **Permission bubbles fiáveis** — enrichment atribuído ao terminal correcto
- **Frontend sincronizado** — terminal:removed WS (8.6) previne acumulação

### Sequência de Implementação

```
Wave 1 (P0) ──────────────────────────────────
  8.1  Fix path conversion         [XS] ─────┐
  8.2  Remove first-project fallback [XS] ───┤
                                              │
Wave 2 (P1) ──────────────────────────────────┤
  8.3  JSONL matching accuracy     [S]  ◄─────┘ (depends on 8.1)
  8.4  Session-aware PID dedup     [M]  ─── parallel
  8.5  Session-aware upsert        [S]  ─── parallel
                                              │
Wave 3 (P2) ──────────────────────────────────┤
  8.6  Frontend WS removal         [S]  ─── parallel
  8.7  Health observability         [M]  ◄─── (depends on 8.1, 8.3)
  8.8  Unit tests                  [M]  ◄─── (depends on 8.1-8.5)
```

---

## 9. Gaps Visuais — Candidatos a Epic Futuro

Os gaps visuais identificados na rev.1 (secção 5.1) permanecem abertos e deverão ser endereçados num epic dedicado. Proposta de escopo:

| Gap | Título Proposto | Prioridade |
|-----|----------------|-----------|
| G1 | Separação visual entre projetos (cor, borda, floor, label por cluster) | CRITICAL |
| G2 | Persistência de clusters ligada a projetos (não a agentes) | HIGH |
| G4 | Atribuição determinística de slots (por project.id ordenado) | MEDIUM |
| G5 | Interação click com agentes (popup detalhes) | MEDIUM |
| G6 | Feedback quando >6 projetos excede limite de clusters | LOW |
| T1 | Consolidação de cores (single source of truth) | MEDIUM |

### Regras de Comportamento (referência para implementação futura)

**R1 — Persistência de Clusters (MUST)**
Um cluster **EXISTE enquanto o projeto existir na tabela `projects`**. NÃO depende de agentes ativos.

**R2 — 12 Mesas por Projeto (MUST)**
Grid 4×3, spacing 2 tiles. Mesas vazias com monitor OFF.

**R3 — Separação Visual (MUST)**
Floor highlight + borda + label destacado, com cor única por projeto (palette de 6).

**R4 — Slots Determinísticos (SHOULD)**
Atribuição por project.id ordenado. Mesmo slot entre reloads. Max 6 projetos visíveis.

---

## 10. Métricas de Referência (Baseline)

| Métrica | rev.1 (2026-03-18) | Atual (2026-03-24) | Target |
|---------|-------|-------|--------|
| Game objects por cluster | ~100 | ~100 | Manter |
| Tweens simultâneos (max) | ~77 | ~77 | <50 |
| HTTP requests por WS `agent:update` | 3 | **0** (directo) | 0 ✅ |
| HTTP requests por WS `terminal:update` | 3 | **1** (throttled 2s) | 1 ✅ |
| Sync cycle time | Não medido | Não medido | <50ms |
| Partículas de poeira | 30 | 30 | 15 |
| Starfield tweens | 1 (alpha pulse) | 1 | 0 |
| Texturas carregadas no boot | Todas | Todas | Só tema ativo + fallback |
| Ficheiros game engine | ~30 | 36 | — |
| LOC total game engine | ~4000 | ~4581 | — |
| LOC OfficeScene | 630 | 722 | — |
| LOC AgentManager | 517 | 540 | — |

---

*Documento gerado por Atlas (Analyst Agent). Revisão 2 — actualizado com estado real do Epic 8 (Terminais Reliability), autopilot engine, métricas de performance e LOC actualizados.*
*Supersedes: rev.1 de 2026-03-18.*

*— Atlas, investigando a verdade 🔎*
