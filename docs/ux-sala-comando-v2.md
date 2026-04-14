# Sala de Comando v2 — UX Research

> **Autor:** Rey (UX Beta) — themaestridev
> **Data:** 2026-04-14
> **Status:** Draft para validação (não implementa código)
> **Contexto:** Redesign do modo grid + botão "+Squad" para um canvas visual estilo n8n, onde agentes (terminais Claude Code) são arrastáveis, conectáveis e conversam entre si.

---

## 1. Personas & Jobs-to-be-Done

### Persona Primária — "O Maestro" (João, criador do AIOX)

| Atributo | Descrição |
|----------|-----------|
| Papel | Desenvolvedor senior, orquestrador de múltiplos agentes |
| Contexto de uso | Monitora N projetos simultaneamente no aiox-monitor (meta) |
| Habilidade | Alta — conhece Claude Code, terminais, prompts |
| Modo mental | "Quero ver meus agentes conversando como se fossem uma sala de guerra" |
| Dor atual | Grid estático + botão "+Squad" é burocrático. Não representa relações entre agentes. |

**Jobs-to-be-Done (o que ele quer fazer em 30s):**

1. **JTBD-1 (≤ 10s):** "Quando entro no app, quero *ver imediatamente* quais agentes estão ativos e o que está acontecendo — sem clicar em nada."
2. **JTBD-2 (≤ 15s):** "Quando tenho uma ideia, quero *largar um agente no canvas, digitar `/` e mandar ele executar* — sem fricção, sem modal, sem wizard."
3. **JTBD-3 (≤ 20s):** "Quando dois agentes precisam colaborar (ex: Architect → Dev), quero *desenhar uma linha entre eles* e que a resposta do primeiro vire input do segundo automaticamente."
4. **JTBD-4 (≤ 30s):** "Quando o Chief delega, quero *ver a conversa fluir em tempo real* nas janelinhas, com os balões aparecendo à medida que chegam tokens."
5. **JTBD-5 (ambiente):** "Quero *salvar layouts* como 'cenários' (ex: 'Sprint planning', 'Code review') e alternar entre eles."

### Persona Secundária — "O Observador" (stakeholder técnico)

| Atributo | Descrição |
|----------|-----------|
| Papel | PM/tech lead acompanhando squad |
| Contexto | Abre o monitor para auditar decisões de agentes |
| Habilidade | Média — entende fluxo mas não edita prompts |
| JTBD único | "Quero ver *quem falou com quem e quando*, sem interferir" |

---

## 2. Fluxo Principal — Adicionar → Posicionar → Conectar → Comandar → Ver cross-talk

```
┌──────────────────────────────────────────────────────────────────────┐
│ PASSO 1 — ADICIONAR                                                  │
│ ─ Usuário abre a Sala de Comando vazia (canvas infinito)             │
│ ─ Pressiona Cmd/Ctrl+K → Command Palette aparece                     │
│ ─ Digita "arch" → filtra "Architect (Obi-Wan)"                       │
│ ─ Enter → node aparece no centro do viewport, já selecionado         │
│   ALTERNATIVA: arrasta do painel lateral (dock de agentes)           │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PASSO 2 — POSICIONAR                                                 │
│ ─ Usuário arrasta o node para a posição desejada                     │
│ ─ Snap-to-grid opcional (tecla Shift desativa)                       │
│ ─ Alinhamento guides aparecem ao se aproximar de outros nodes        │
│ ─ Se soltar perto da borda → viewport faz pan automático             │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PASSO 3 — CONECTAR                                                   │
│ ─ Usuário hover no node → handles aparecem (pontos nas 4 bordas)     │
│ ─ Clica no handle direito e arrasta → linha tracejada segue o mouse  │
│ ─ Solta sobre outro node → conexão se materializa (sólida)           │
│ ─ Direção = fluxo de contexto (A → B significa "resposta de A vira  │
│   input de B automaticamente na próxima mensagem")                   │
│ ─ Hover na edge → badge mostra "Contexto: auto-forward" + botão X    │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PASSO 4 — COMANDAR                                                   │
│ ─ Usuário clica no node (foco) ou usa Tab para navegar               │
│ ─ Input da janelinha recebe foco automaticamente                     │
│ ─ Digita "/" → slash menu aparece (create-story, task, research…)    │
│ ─ Seleciona comando + argumentos → Enter                             │
│ ─ Balão do usuário aparece no topo do chat + badge "running"         │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PASSO 5 — VER CROSS-TALK                                             │
│ ─ Resposta streama token-a-token no balão do agente                  │
│ ─ Edge A→B pulsa (animação) quando contexto está sendo transferido   │
│ ─ Balão aparece automaticamente em B com prefixo "[from: Obi-Wan]"   │
│ ─ Mini-mapa no canto mostra atividade (dots piscando nos nodes)      │
│ ─ Timeline no rodapé: linha do tempo global dos eventos              │
└──────────────────────────────────────────────────────────────────────┘
```

### Fluxo alternativo — Chief orquestrando múltiplos

```
Chief (Yoda) conectado a → Architect, Dev-Alpha, Dev-Beta, QA
Usuário digita no Chief: "/delegate refactor do módulo X"
  ├─ Edge Chief→Architect pulsa → Architect recebe "[plan the refactor]"
  ├─ Architect responde → contexto flui para Dev-Alpha + Dev-Beta em paralelo
  ├─ Devs respondem → contexto flui para QA
  └─ QA responde ao Chief → ciclo fecha visualmente
```

---

## 3. Wireframes ASCII — 7 telas-chave

### Tela 1 — Estado vazio (primeira abertura)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡] Sala de Comando                        [cenários ▾] [⚙] [🌙]    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                                                                      │
│                        ╭─────────────────────╮                       │
│                        │    Canvas vazio     │                       │
│                        │                     │                       │
│                        │   ⌘K  para começar  │                       │
│                        │   ou arraste um     │                       │
│                        │   agente do dock →  │                       │
│                        ╰─────────────────────╯                       │
│                                                                      │
│                                                                      │
│ ┌──── Dock (agents) ────┐                                            │
│ │ 🧙 Chief    🏛 Arch    │                                            │
│ │ 💻 Dev-α   💻 Dev-β   │                                            │
│ │ 🎨 UX-α    🎨 UX-β    │                                            │
│ │ 🧪 QA      🚀 DevOps  │                                            │
│ └───────────────────────┘                                            │
└──────────────────────────────────────────────────────────────────────┘
```

### Tela 2 — Command Palette (⌘K) aberto

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│             ┌──────────────────────────────────────────┐             │
│             │ 🔍 arch|                                  │            │
│             ├──────────────────────────────────────────┤             │
│             │ ▸ 🏛 Architect (Obi-Wan)      add agent  │             │
│             │   🏛 Architect AIOX base      add agent  │             │
│             │   ↳ task: draft-story         run task   │             │
│             │   ↳ cenário "architecture review"        │             │
│             └──────────────────────────────────────────┘             │
│                                                                      │
│                    Tab navega • Enter confirma                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Tela 3 — Node individual (janelinha de chat "disfarçada")

```
    ╭──────────────────────────────────────╮
  ○─┤ 🏛 Obi-Wan  •  Architect       ⋯ ✕ ├─○    ← handles (conexão)
    ├──────────────────────────────────────┤
    │ [user] /research padrões canvas      │
    │ [me] Identifiquei 3 padrões chave:  │
    │      1. n8n usa nodes retangulares… │     ← chat streaming
    │      ▌                                │     ← cursor de stream
    ├──────────────────────────────────────┤
    │ / _                          [↵ run] │    ← input + slash menu
    ╰──────────────────────────────────────╯
  ○                                        ○
    ● running  •  12s  •  contexto: 4.2k
```

**Dimensões sugeridas:** 320×220px default, redimensionável (min 240×160, max 520×400).

### Tela 4 — Canvas com múltiplos agentes + conexões ativas

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡] Sala • cenário: sprint-planning         [salvar] [⚙]            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│        ╭─🧙 Yoda──╮                                                  │
│        │ Chief   │━━━━━━━━━━━━┓                                      │
│        ╰─────────╯            ┃  (pulsando)                          │
│             ┃                 ┃                                      │
│             ▼                 ▼                                      │
│        ╭─🏛 Obi-Wan╮     ╭─🎨 Rey────╮                              │
│        │ Architect│━━━━━>│ UX-Beta  │                                │
│        ╰──────────╯      ╰──────────╯                                │
│             ┃                                                        │
│             ▼                                                        │
│        ╭─💻 Han──╮    ╭─💻 Luke─╮                                    │
│        │ Dev-β  │────│ Dev-α   │                                     │
│        ╰────────╯    ╰─────────╯                                     │
│             ┃             ┃                                          │
│             ▼             ▼                                          │
│            ╭─🧪 Mace────╮                                            │
│            │ QA        │                                             │
│            ╰───────────╯                                             │
│                                                                      │
│ ┌─Mini-map─┐  ┌─Timeline──────────────────────────────────┐          │
│ │ · ·  •   │  │ 14:02 Chief→Arch  14:03 Arch→Dev (x2)…    │          │
│ └──────────┘  └────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
```

### Tela 5 — Edge selecionada (configurar conexão)

```
        ╭─🏛 Obi-Wan╮
        │ Architect│
        ╰────┬─────╯
             │                   ┌──────── Edge config ────────┐
             │ ◀ selecionada     │ from: Obi-Wan               │
             ▼                   │ to:   Han                    │
        ╭─💻 Han──╮               │ modo: [▾ auto-forward]      │
        │ Dev-β  │               │   ○ manual relay             │
        ╰────────╯               │   ● auto-forward             │
                                 │   ○ broadcast (1-to-many)    │
                                 │ filtro: [▾ apenas decisões] │
                                 │ [remover]       [aplicar]    │
                                 └──────────────────────────────┘
```

### Tela 6 — Slash menu dentro do node

```
    ╭──────────────────────────────────────╮
    │ 🏛 Obi-Wan • Architect         ⋯ ✕  │
    ├──────────────────────────────────────┤
    │ [me] Anteriormente decidi usar…      │
    ├──────────────────────────────────────┤
    │ /draf|                                │
    │ ┌──────────────────────────────────┐ │
    │ │▸ /draft-story    criar story     │ │
    │ │  /draft-epic     criar epic      │ │
    │ │  /draft-adr      criar ADR       │ │
    │ └──────────────────────────────────┘ │
    │                           [↵ run]   │
    ╰──────────────────────────────────────╯
```

### Tela 7 — Seleção múltipla (marquee) + ação em lote

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│    ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐                                   │
│    ╎ ╭─🏛 Obi-Wan╮   ╭─💻 Han──╮ ╎                                   │
│    ╎ │ Architect│   │ Dev-β  │ ╎  3 selecionados                     │
│    ╎ ╰──────────╯   ╰────────╯ ╎  ┌──────────────────┐              │
│    ╎          ╭─💻 Luke─╮       ╎  │ agrupar          │              │
│    ╎          │ Dev-α  │        ╎  │ conectar todos   │              │
│    ╎          ╰────────╯        ╎  │ enviar comando…  │              │
│    └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘  │ duplicar         │              │
│                                     │ remover (⌫)      │              │
│                                     └──────────────────┘              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Benchmarking — Padrões de ferramentas-referência

| Ferramenta | O que adotar | O que evitar | Aplicação aqui |
|-----------|--------------|--------------|----------------|
| **n8n** | Nodes retangulares com input/output handles explícitos; edges com animação de pulso quando ativas; minimap | Configuração complexa de nodes em painel lateral (trava o fluxo visual) | Handles visíveis só no hover; edges pulsam durante streaming |
| **Figma / Miro** | Canvas infinito com pan (space+drag), zoom (scroll+ctrl), marquee selection, smart guides | Tool palettes flutuantes que poluem | Canvas infinito + marquee + guides; toolbar única superior |
| **Whimsical (sticky connect)** | Conectar via *hover-drag* em qualquer borda, sem handles rígidos; cores sutis | Overloading de tipos de forma | Conexão a partir de qualquer ponto da borda; cores = categoria de agente |
| **Raycast / Arc** | Command palette universal (⌘K); fuzzy match; actions encadeáveis; keyboard-first | Excesso de modais empilhados | ⌘K como ponto de entrada primário para qualquer ação |
| **assistant-ui / ChatGPT** | Streaming token-a-token visível; separação clara user/assistant; markdown rendering; code blocks | Chat ocupa viewport inteiro | Chat compactado em "janelinha" (node), mas com streaming preservado |
| **Linear** | Hotkeys consistentes, command bar, peek views | — | Hotkeys em tudo; peek ao hover em nodes não-selecionados |

### Princípios destilados

1. **Keyboard-first:** toda ação frequente tem atalho (n8n, Linear, Raycast).
2. **Direct manipulation:** arrastar, conectar, selecionar sem modais (Figma/Miro, Whimsical).
3. **Progressive disclosure:** handles/configs aparecem só no hover/foco (Whimsical).
4. **Real-time feedback:** streaming + pulsação de edges torna o sistema "vivo" (n8n exec view + ChatGPT).
5. **Spatial memory:** posição dos nodes persiste por cenário; usuário reconhece pelo layout (Miro).

---

## 5. Microinterações — catálogo

| Gatilho | Feedback visual | Feedback motion | Feedback sonoro (opcional) |
|---------|----------------|-----------------|---------------------------|
| **Hover em node** | Sombra eleva, borda ganha +1px, handles aparecem (fade 120ms) | — | — |
| **Arrastar node (grab)** | Cursor vira `grabbing`, opacidade 0.9, sombra aumenta | Smart guides aparecem em 80ms ao aproximar de outros | — |
| **Soltar node (drop)** | Snap com bounce sutil (scale 1.02 → 1.0, 180ms) | — | click leve |
| **Iniciar conexão** | Handle vira círculo cheio, linha tracejada segue cursor | Outros handles compatíveis ganham halo pulsante | — |
| **Completar conexão** | Edge vira sólida, pulso de cor (200ms) | Flash no node destino | beep curto |
| **Conexão inválida** | Cursor mostra 🚫, linha fica vermelha tracejada | Shake horizontal (4px, 120ms) no destino | — |
| **Foco no input do node** | Border accent + glow sutil | Input expande altura levemente | — |
| **Digitar `/`** | Slash menu aparece com scale 0.95 → 1.0 (140ms) | — | — |
| **Streaming de resposta** | Cursor `▌` piscando no fim do texto | Edge origem-destino pulsa a cada chunk | — |
| **Cross-talk (contexto flui A→B)** | Edge pulsa verde (400ms), badge `[from: A]` no balão de B | Partícula viaja pela edge (300ms) | swoosh baixo |
| **Seleção múltipla (marquee)** | Retângulo tracejado, contador flutuante "N selecionados" | Nodes dentro ganham ring | — |
| **Delete (⌫)** | Node encolhe e fade out (200ms), edges conectadas se desfazem | — | — |
| **Pan do canvas** | Cursor vira `grab`; grid sutil se move | — | — |
| **Zoom** | Grid density ajusta; nodes fora do nível detail viram "pills" minimizadas | Transição 100ms | — |
| **Auto-save cenário** | Toast discreto "✓ salvo" no canto inferior por 1.5s | — | — |

### Estados de node (importantes para legibilidade)

```
idle         ╭─────╮          borda neutra, sem badge
             │     │
             ╰─────╯

running      ╭─────╮  ●       borda accent pulsante, dot verde
             │ ... │
             ╰─────╯

error        ╭─────╮  !       borda vermelha sólida, ícone alert
             │     │
             ╰─────╯

waiting      ╭─────╮  ⏳      borda tracejada cinza
(aguarda     │     │          (ex: aguardando contexto de upstream)
contexto)    ╰─────╯

muted        ╭─────╮          opacidade 0.5
(temp off)   │     │
             ╰─────╯
```

---

## 6. Comparação — Ferramentas node-based AI

| Dimensão | **Langflow** | **Flowise** | **Rivet** | **Proposta aqui** |
|----------|-------------|-------------|-----------|-------------------|
| **Modelo mental** | Graph executor (DAG) | Graph executor (DAG) | Graph + IDE de prompts | Sala viva de agentes conversando |
| **Unidade básica** | Componente LLM/chain | Componente LangChain | Node tipado (texto, code, LLM) | Agente (terminal Claude Code disfarçado) |
| **Visual do node** | Card grande com N props editáveis inline | Card com props em painel lateral | Node compacto + editor separado | Janelinha de chat ao vivo |
| **Edges** | Dados tipados (string→string, obj→obj) | Dados tipados | Dados tipados + controle de fluxo | Contexto conversacional (opcionalmente filtrado) |
| **Execução** | Run → passo-a-passo | Run → resultado final | Step debugger embutido | *Contínua* — cada agente responde em tempo real quando recebe msg |
| **Input do usuário** | Form lateral ou inline | Chat flutuante | Console dedicado | **No próprio node** (cada um é um chat) |
| **Público-alvo** | LLM devs/tinkerers | Builders no-code | Prompt engineers | Orquestradores de squads de agentes |
| **Força** | Ecossistema LangChain | Facilidade UX | Debug profundo | Sensação de "sala viva" + Claude Code real |
| **Fraqueza** | Pesado visualmente | Execução opaca | Curva de aprendizado | (a validar) |

### Diferenciação da Sala de Comando

1. **Não é um graph builder — é um espaço vivo.** Langflow/Flowise são editores de pipeline: você *constrói*, depois *roda*. Aqui, os agentes **estão sempre rodando** (ou prontos), e o canvas é onde você *conversa com eles*.
2. **Cada node é um chat, não um componente.** Em Rivet/Langflow, um node é uma função. Aqui, um node é um **participante ativo** com histórico próprio.
3. **Edges transportam contexto conversacional, não dados tipados.** Simplifica drasticamente o modelo mental.
4. **Claude Code como runtime real.** Não é um mock de LLM — são terminais de verdade do CLI do Claude Code.
5. **Cenários como espaços salvos.** Layout + agentes + conexões = um "modo de trabalho" alternável (sprint-planning, code-review, debug-session).

---

## Próximos passos sugeridos

1. **Validar JTBDs** com 2-3 usuários reais (sessão de ~20min cada).
2. **Prototipar tela 4** (canvas com múltiplos agentes + cross-talk) em Figma para validar legibilidade do streaming simultâneo.
3. **Testar densidade visual:** 8+ nodes no canvas sem virar ruído.
4. **Spec de acessibilidade** (próximo doc): navegação por teclado completa, ARIA live regions para streaming, contraste WCAG AA, modo reduced-motion.
5. **Handoff para @architect (Obi-Wan):** definir modelo de dados de `scenario` + `edge.mode` + protocolo de cross-talk.

---

*— Rey, the Force reveals all 🎨🌟*
