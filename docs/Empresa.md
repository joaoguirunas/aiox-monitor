# Empresa — Contexto Funcional, Status & Epic de Evolução

> **Autor:** Atlas (Analyst Agent) | **Data:** 2026-03-18
> **Projeto:** aiox-monitor | **Branch:** main

---

## 1. Objetivo do Módulo

A aba Empresa (`/empresa`) é a **representação visual imersiva** do sistema aiox-monitor. Renderiza um escritório isométrico em pixel art (Phaser.js) onde cada agente AI é um personagem animado que se movimenta entre mesas de trabalho e áreas de recreação conforme o seu estado operacional.

**Perguntas que responde:**

- Quais projetos estão ativos e quantos agentes estão a trabalhar em cada um?
- Que agentes estão a trabalhar, em pausa, ou inativos — e onde estão fisicamente?
- Que ferramenta cada agente está a usar neste momento?
- Algum agente está bloqueado à espera de permissão?

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
| Configuração | Singleton DB row + localStorage | `src/app/empresa/config/page.tsx` |

### 2.2 Fluxo de Dados

```
Eventos (Hook Python / JSONL Watcher)
    ↓
event-processor.ts → agent-tracker.ts → terminal-tracker.ts
    ↓
SQLite (agents, terminals, projects)
    ↓
WebSocket broadcast (agent:update, terminal:update, event:new)
    ↓
PhaserGame.tsx (React)
    ├── Throttle 2s
    ├── GET /api/agents?expand=terminals  → syncAgents()
    ├── GET /api/projects                 → syncProjects()
    └── GET /api/company-config           → setTheme()
    ↓
react-phaser-bridge.ts → emitToGame()
    ↓
OfficeScene.ts
    ├── sync:projects → AgentManager.syncProjects()
    ├── sync:agents   → AgentManager.syncAll()
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

---

## 3. Inventário de Componentes

### 3.1 Frontend

| Ficheiro | LOC | Função |
|----------|-----|--------|
| `src/app/empresa/page.tsx` | ~15 | Página — dynamic import PhaserGame |
| `src/app/empresa/config/page.tsx` | ~400 | Dashboard config (tema, skins, timeouts, Ganga) |
| `src/components/empresa/PhaserGame.tsx` | 125 | React wrapper — WS → fetch → bridge sync |
| `src/components/empresa/config/agent-colors.ts` | ~30 | Mapa de cores para config UI |

### 3.2 Game Engine

| Ficheiro | LOC | Complexidade | Função |
|----------|-----|-------------|--------|
| `src/game/scenes/BootScene.ts` | 157 | Média | Asset loading (PixelLab, skins, tiles, procedural) |
| `src/game/scenes/OfficeScene.ts` | 630 | Alta | Cena principal: floor, walls, furniture, camera, managers |
| `src/game/managers/AgentManager.ts` | 517 | Alta | Lifecycle de sprites: create, position, transition, wander |
| `src/game/managers/ClusterManager.ts` | 126 | Média | Clusters de mesas por projeto (12 mesas cada) |
| `src/game/objects/AgentSprite.ts` | 745 | Muito Alta | Sprite direcional, badges, labels, particles, effects |
| `src/game/objects/Desk.ts` | 255 | Alta | Mesa iMac com monitor, keyboard, código animado |
| `src/game/objects/` (16 mais) | ~1400 | Média | Sofa, Hammock, ArcadeMachine, GamingSetup, etc. |
| `src/game/config.ts` | ~30 | Simples | Configuração Phaser |

### 3.3 Data & Configuration

| Ficheiro | Função |
|----------|--------|
| `src/game/data/office-layout.ts` | Layout: CLUSTER_ORIGINS (6 slots), RECREATION_POSITIONS (33), FURNITURE_POSITIONS |
| `src/game/data/themes.ts` | 4 temas: moderno, espacial, oldschool, cyberpunk (17 props cada) |
| `src/game/data/agent-sprite-config.ts` | 12 configs visuais (cor, acessório, cabelo) |
| `src/game/data/agent-visuals.ts` | Cores Phaser + cores de status (duplica parcialmente sprite-config) |
| `src/game/data/pixellab-sprites.ts` | 11 agentes × 4 direções PixelLab |
| `src/game/data/skin-config.ts` | 20 skins alternativas (10 aliens + 10 animais) |
| `src/game/data/desk-sprites.ts` | 3 tamanhos de mesa (4, 12, 16 seats) |
| `src/game/data/floor-tiles.ts` | Texturas de chão por zona/tema |

### 3.4 Utilities & Bridge

| Ficheiro | Função |
|----------|--------|
| `src/game/bridge/react-phaser-bridge.ts` | Comunicação React↔Phaser (syncAgents, syncProjects, setTheme) |
| `src/game/utils/iso-utils.ts` | Conversão tile↔pixel isométrica (2:1) |
| `src/game/utils/sprite-generator.ts` | Geração procedural de spritesheets (451 LOC, Canvas API) |
| `src/game/animations/agent-animations.ts` | Registro de animações (6 por agente: idle, walk×3, sit, type) |

### 3.5 Backend (relevante para Empresa)

| Ficheiro | Função |
|----------|--------|
| `src/app/api/agents/route.ts` | GET agents (com `expand=terminals` para instâncias) |
| `src/app/api/company-config/route.ts` | GET/PUT config (tema, timeouts, Ganga) |
| `src/lib/queries.ts` | `getAgentInstances()`, `getAgents()`, `getProjects()` |
| `src/server/idle-detector.ts` | Transições: working→idle→break→offline (30s loop) |
| `src/server/agent-tracker.ts` | Upsert agentes + status via eventos |
| `src/server/terminal-tracker.ts` | Terminal lifecycle (PID, window title, reactivation) |
| `src/server/jsonl-watcher.ts` | JSONL parsing: tool detail + permission detection |
| `src/server/ws-broadcaster.ts` | Broadcast WebSocket para todas as abas |

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

**Total: 13 stories, 141/142 ACs entregues.** AC26 (per-pixel matrix masking) diferido — requer WebGL shaders.

### 4.2 Funcionalidades Operacionais

- [x] Escritório isométrico com 4 zonas (trabalho, recreação, quarto, entrada)
- [x] 6 slots de cluster para projetos (12 mesas cada, total 72 workstations)
- [x] 18 tipos de mobília renderizados programaticamente
- [x] 11 agentes com sprites únicos (procedural + PixelLab)
- [x] 20 skins alternativas (aliens + animais)
- [x] 4 temas visuais com hot-swap via WebSocket
- [x] Animações completas: walk, sit, type, idle, spawn, despawn
- [x] Wander system: agentes idle/break movem-se na recreação a cada 8s
- [x] Tool detail labels ("Running: npm test") via JSONL watcher
- [x] Permission bubble (amber) quando agente aguarda permissão
- [x] Camera pan/zoom com starfield parallax
- [x] Config UI: tema, skins, timeouts, empresa, Ganga Ativo

---

## 5. Gaps Identificados

### 5.1 Gaps Funcionais (UX/Visual)

| # | Gap | Sev. | Detalhe |
|---|-----|------|---------|
| **G1** | **Separação entre projetos confusa** | CRITICAL | Clusters sem divisão visual — sem floor highlight, sem borda, sem cor por projeto. Labels de 11px alpha 0.7 quase invisíveis. Work zone inteira é bloco uniforme. |
| **G2** | **Mesas desaparecem** | HIGH | Clusters dependem de agentes ativos para existir. Projeto sem agentes momentâneos perde representação. `syncProjects()` e `syncAll()` não estão alinhados sobre quem é fonte de verdade para clusters. |
| **G3** | **Performance lenta** | HIGH | Cada WS event dispara 3 HTTP requests (agents+projects+config) com full re-fetch. `syncAll()` itera todos agentes+clusters. 30 partículas de poeira + starfield com tweens infinitos. |
| **G4** | **Atribuição de slots não-determinística** | MEDIUM | Slots atribuídos por ordem de chegada (first available). Projetos podem mudar de posição entre reloads. |
| **G5** | **Sem interação com agentes** | MEDIUM | Não é possível clicar num agente para ver detalhes (eventos, terminal, sessão). |
| **G6** | **Limite de 6 projetos silencioso** | LOW | Se >6 projetos ativos, excedentes ficam sem cluster sem feedback ao utilizador. |
| **G7** | **Sem indicação de multi-terminal** | LOW | Mesmo agente com N terminais aparece como 1 sprite (ou N sprites sem ligação visual). |

### 5.2 Gaps Técnicos

| # | Gap | Sev. | Detalhe |
|---|-----|------|---------|
| **T1** | **Cores de agente duplicadas** | MEDIUM | `agent-sprite-config.ts` e `agent-visuals.ts` definem cores separadamente. Sem single source of truth. |
| **T2** | **Tween proliferation** | MEDIUM | Até 7 tweens por agente × 11 agentes = 77 tweens simultâneos. Sem pooling nem limite global. |
| **T3** | **BootScene carrega TUDO upfront** | MEDIUM | Todas as texturas de todos os temas + skins carregadas no boot. Sem lazy loading. |
| **T4** | **Magic numbers em AgentSprite** | LOW | ~20 hardcoded offsets (spriteY: -14, glow: 22, label: -48, badge: 16/-30, etc.) |
| **T5** | **Ganga scope UI vs. backend** | LOW | Config UI mostra "safe-only" vs "safe-and-ambiguous" mas backend só verifica `ganga_enabled` boolean. |
| **T6** | **Zero testes** | LOW | Nenhum teste para game engine, managers, ou objects. |
| **T7** | **Silent error swallowing** | LOW | BootScene catch blocks vazios. Falhas de textura invisíveis. |

### 5.3 Gaps de Backend

| # | Gap | Sev. | Detalhe |
|---|-----|------|---------|
| **B1** | **Idle detector loop em offline** | MEDIUM | Agentes offline continuam a ser avaliados no loop sem guard. |
| **B2** | **Terminal PID recycling** | LOW | Se PID é reciclado dentro da janela de purge (1h), pode causar atribuição fantasma. |
| **B3** | **Agent heuristic false positives** | LOW | Pattern scanning do event-processor pode identificar agent names em código/comentários do utilizador. |

---

## 6. Riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|-------|-------|---------|-----------|
| R1 | **Performance degrada com scale** — mais projetos/agentes = mais objetos Phaser + network | Alta | Alto | Sync incremental (diff-based), lazy cluster creation, object pooling |
| R2 | **Projetos ficam visualmente misturados** — utilizador confunde agentes entre projetos | Alta | Alto | Separação visual obrigatória (floor, border, color, label) |
| R3 | **Mesas desaparecem inesperadamente** — clusters removidos quando projetos ficam sem agentes | Média | Alto | Clusters ligados a projetos (DB), não a agentes |
| R4 | **Stale state visual** — utilizador vê estado desatualizado se WS desligar silenciosamente | Média | Médio | Heartbeat check, reconnection indicator, periodic full-refresh |
| R5 | **Memory leak em sessões longas** — tweens, particles, sprites acumulam sem cleanup | Baixa | Alto | Auditoria de destroy(), limites de tweens, object pooling |
| R6 | **PixelLab sprites 404** — skins referenciadas mas ficheiros ausentes no filesystem | Baixa | Baixo | Validação de texturas no BootScene com fallback procedural |

---

## 7. Dependências

### 7.1 Upstream (Empresa depende de)

| Componente | Detalhe | Risco se falhar |
|------------|---------|-----------------|
| `GET /api/agents?expand=terminals` | Instâncias de agentes por terminal | Escritório vazio |
| `GET /api/projects` | Lista de projetos para clusters | Sem clusters visíveis |
| `GET /api/company-config` | Tema, timeouts | Tema default, timeouts hardcoded |
| WebSocket `/ws` | Updates real-time | Escritório estático (só refresh manual) |
| `idle-detector.ts` | Transições working→idle→break→offline | Agentes ficam "stuck" no último estado |
| `jsonl-watcher.ts` | Tool detail + permission detection | Sem labels de ferramenta, sem bubbles |
| Phaser.js 3.x | Game engine | Módulo inteiro inoperável |
| PixelLab sprites (`/public/sprites/`) | Texturas de agentes | Fallback procedural (menor qualidade) |

### 7.2 Downstream (quem depende do Empresa)

| Componente | Detalhe |
|------------|---------|
| Navbar | Link `/empresa` + `/empresa/config` |
| `ProjectSelector` | Filtra a vista por projeto selecionado |
| Theme system | Config UI broadcast afeta Empresa em tempo real |

### 7.3 Dependências Transversais

| Com | Tipo | Detalhe |
|-----|------|---------|
| Kanban (`/kanban`) | Shared state | Ambos usam `useWebSocket` + mesmas APIs. Risco de drift se lógica divergir |
| Lista (`/lista`) | Read-only | Lista mostra eventos que geram mudanças visuais na Empresa |
| Terminais (`/terminais`) | Data overlap | Terminais mostra tool_detail que Empresa renderiza como label |

---

## 8. Epic 8 — Empresa 2.0: Clareza, Performance & Estabilidade

### Visão

Transformar a aba Empresa de uma visualização impressionante mas confusa num **monitor espacial produtivo** onde cada projeto é imediatamente identificável, as mesas são persistentes e o sistema responde de forma fluída.

### Escopo

| In Scope | Out of Scope |
|----------|-------------|
| Separação visual entre projetos (cor, borda, floor, label) | Novos tipos de mobília |
| Persistência de mesas (ligadas a projetos, não agentes) | Interação click com agentes (epic separada) |
| Performance (sync incremental, split fetch) | Novos temas visuais |
| Atribuição determinística de slots | PixelLab per-pixel masking (AC26 diferido) |
| Redução de carga visual (partículas, tweens) | Multiplayer/multi-user |
| Consolidação de cores (single source of truth) | Testes unitários do game engine |

### Critérios de Sucesso

| # | Critério | Métrica / Validação |
|---|----------|---------------------|
| S1 | **Projetos visualmente distintos** | Cada cluster tem cor de floor, borda e label únicos. Utilizador identifica projeto em <2s |
| S2 | **Mesas nunca desaparecem** | Cluster persiste enquanto projeto existir na DB, independente de agentes ativos |
| S3 | **12 mesas visíveis por projeto** | Grid 4×3 com mesas standby (monitor OFF) quando não ocupadas |
| S4 | **Performance aceitável** | Sync cycle <50ms. Sem re-fetch de projects/config a cada WS event |
| S5 | **Slots determinísticos** | Mesmo projeto no mesmo slot entre page reloads e server restarts |
| S6 | **Zero regressões** | Todas as funcionalidades existentes (temas, skins, wander, spawn effects) mantidas |

### Stories (formalizadas em `docs/stories/8.x.story.md`)

| Story | Título | Prioridade | Depende | Ficheiros Principais |
|-------|--------|-----------|---------|---------------------|
| **8.1** | Persistência de Clusters por Projeto | CRITICAL | 6.1 | ClusterManager.ts, AgentManager.ts, PhaserGame.tsx |
| **8.2** | Separação Visual entre Projetos | CRITICAL | 8.1 | ClusterManager.ts, office-layout.ts, novo cluster-colors.ts |
| **8.3** | Performance: Sync Incremental | HIGH | 8.1 | PhaserGame.tsx, AgentManager.ts, OfficeScene.ts |
| **8.4** | Atribuição Determinística de Slots | MEDIUM | 8.1 | ClusterManager.ts |
| **8.5** | Consolidação de Cores & Cleanup | LOW | 8.2 | agent-visuals.ts, agent-sprite-config.ts, AgentSprite.ts, BootScene.ts |

### Sequência de Implementação

```
8.1 (Persistência)  ──→  8.2 (Separação Visual)  ──→  8.5 (Cleanup)
         │
         ├──→  8.3 (Performance)
         │
         └──→  8.4 (Slots Determinísticos)
```

**8.1 é pré-requisito de tudo** — clusters precisam ser persistentes antes de decoração ou optimização.
**8.3 e 8.4 são independentes entre si** e podem correr em paralelo após 8.1.
**8.5 depende de 8.2** — cores de cluster devem existir antes de consolidar cores de agente.

---

## 9. Regras de Comportamento (referência para implementação)

### R1 — Persistência de Clusters (MUST)
Um cluster **EXISTE enquanto o projeto existir na tabela `projects`**. NÃO depende de agentes ativos. `syncProjects()` é a fonte de verdade. `removeCluster()` SÓ quando projeto é deletado.

### R2 — 12 Mesas por Projeto (MUST)
Grid 4×3, spacing 2 tiles. Mesas vazias com monitor OFF. Agentes ocupam sequencialmente. Máximo 12 agentes por cluster.

### R3 — Separação Visual (MUST)
Floor highlight + borda + label destacado, com cor única por projeto (palette de 6). Cores independentes do tema.

### R4 — Sync Incremental (MUST)
Projects/config fetchados no init + eventos dedicados. Agents diff-based. Throttle 2s mantido.

### R5 — Ciclo de Vida Visual (MUST)
working→mesa, idle/break→recreação, offline→despawn. Transições animadas (walk). Mesas libertadas ficam standby.

### R6 — Slots Determinísticos (SHOULD)
Atribuição por project.id ordenado. Mesmo slot entre reloads. Max 6 projetos visíveis.

---

## 10. Métricas de Referência (Baseline)

| Métrica | Valor Atual | Target |
|---------|-------------|--------|
| Game objects por cluster | ~100 (12 Desk × ~8 graphics cada) | Manter |
| Tweens simultâneos (max) | ~77 (7 por agente × 11) | <50 |
| HTTP requests por WS event | 3 (agents + projects + config) | 1 (agents only) |
| Sync cycle time | Não medido | <50ms |
| Partículas de poeira | 30 | 15 |
| Starfield tweens | 1 (alpha pulse) | 0 |
| Texturas carregadas no boot | Todas (todos temas + skins) | Só tema ativo + fallback |

---

*Documento gerado por Atlas (Analyst Agent) como base para decisão de Epic e priorização de stories.*
*Supersedes: `docs/empresa-module.md` (diagnóstico parcial de 2026-03-18).*

*— Atlas, investigando a verdade 🔎*
