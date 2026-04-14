# JOB-008 — Design Visual: Redesign Sala de Comando

**Autor:** Padmé (UX-Alpha — UI Design Specialist)
**Squad:** themaestridev
**Escopo:** Especificação de design (sem implementação)
**Referências:** Linear, Raycast, Arc Browser, Vercel v0, Novel editor

---

## 1. Anatomia do Node-Chat

Cada node é um **cartão de conversa**, não um terminal. Dimensão base **360×280px** (colapsado: 360×88, expandido full: 420×520). Border-radius **14px**. Border **1px solid surface-300** com leve inner-glow quando selecionado.

### Header (altura 56px, padding 12px 16px)
- **Avatar** 36×36, circular, border 2px na cor-acento do personagem. Se agente "speaking" → halo pulsante 1.5s ease-in-out.
- **Nome** (ex.: "Yoda — Chief") tipografia `Inter 14px / 600 / tracking -0.01em`. Subtítulo role `12px / 400 / text-muted`.
- **Status dot** 8px, canto superior direito do avatar, com ring 2px da cor de surface (cria "punched out" effect).
- **Menu kebab** à direita (⋯) — abre popover com *Rename*, *Disconnect*, *Clear history*, *Remove*.

### Área de mensagens (flex-1, padding 12px 16px, gap 8px)
- **Bolha user:** alinhada à direita, `bg: accent-agent/12%`, border-radius `12px 12px 4px 12px`, padding `8px 12px`, max-width 85%. Texto `13px / 1.5`.
- **Bolha agent:** alinhada à esquerda, `bg: surface-200`, border-radius `12px 12px 12px 4px`. Mesma tipografia.
- **Timestamp** micro (11px / text-subtle) aparece no hover da bolha, não fixo.
- **Blocos de código** dentro de bolha: fundo `surface-400`, mono `JetBrains Mono 12px`, border-radius 6px, padding 8px.
- **Scroll** auto-hide; gradient-fade 24px no topo quando há overflow.

### Input (altura 48px, padding 8px 12px)
- Background `surface-200`, border `1px solid surface-300`, border-radius 10px.
- Placeholder: *"Fale com {Nome}… ou digite / para comandos"*.
- Ao digitar `/` → popover com lista filtrada (Raycast-style): ícone + nome + shortcut. Fuzzy search.
- Botões microajuste: `@` (mention outro agente), `⏎` send, `⌘↵` run sem confirmar.

### Footer / Handles (altura 24px)
- **Handle de entrada** (esquerda-meio): círculo 10px, border 2px `accent-agent`, fill `surface-100`. No hover expande para 14px + tooltip "Receber de…".
- **Handle de saída** (direita-meio): mesmo estilo, fill sólido.
- Secundário: handle no topo para **broadcast** (Chief → múltiplos), estilo diamante.

---

## 2. Sistema de Conexões

**Forma:** **Bezier suave** (não straight, não curva pesada). Control points a 40% da distância horizontal. Stroke-width **1.5px** idle, **2px** active. Evitar overlap: usar `edge-routing` com offset incremental quando múltiplas arestas compartilham nodes.

### Direcionalidade
- **Mão única** (default) — seta pequena 8px no destino, no formato "chevron" (não triângulo preenchido), cor = cor do agente origem.
- **Mão dupla** (chat bidirecional ativo) — sem seta, em vez disso **dois dots** pulsando alternadamente nas pontas (data ping-pong).

### Estados

| Estado | Visual |
|---|---|
| **idle** | `stroke: surface-400`, opacity 0.6, dashed 4-2 |
| **active-speaking** | sólido, cor do agente falante, stroke 2px, **glow** `0 0 8px agent-color/40%` |
| **data-flowing** | sólido + **particle** (dot 4px) percorrendo path a cada 800ms, easing `cubic-bezier(.4,0,.2,1)` |
| **error** | `stroke: danger-500`, animação shake 200ms, ícone ⚠ no midpoint |
| **hover** | stroke 2.5px, label com latência/último msg aparece no midpoint |

Handles "magnéticos": ao arrastar cabo, handles compatíveis pulsam suavemente (1.2× scale, 600ms).

---

## 3. Estados do Agente

Todos refletidos em três lugares: **status dot**, **avatar ring**, **border do card**.

| Estado | Status dot | Avatar ring | Card border | Extra |
|---|---|---|---|---|
| **online** | `emerald-500` sólido | cor agente estática | surface-300 | — |
| **thinking** | `amber-400` **pulsando** 1s | ring com shimmer rotativo 2s | surface-300 | três dots "•••" animados no footer (typing indicator) |
| **speaking** | `emerald-500` + halo expansivo | halo pulsante cor-agente | **border glow** cor-agente 1px outer | última bolha tem cursor blinking no final |
| **idle** | `zinc-500` semi-opaco | ring opacity 50% | surface-300 opacity 70% | card inteiro a 92% opacity |
| **error** | `rose-500` sólido | ring `rose-500` | border `rose-500/60%`, inner-shadow rose | toast inline "Conexão perdida · retry" |

---

## 4. Paleta

**Base dark-friendly** (inspiração Linear + Arc). Nada de `#000`. Tom azulado muito leve.

### Neutros
- `surface-0` (canvas bg): `#0E1014`
- `surface-100` (card bg): `#15181F`
- `surface-200` (input, bolha agent): `#1C2029`
- `surface-300` (borders, dividers): `#262B36`
- `surface-400` (code, handles idle): `#353B48`
- `text-primary`: `#E8EAED`
- `text-muted`: `#9BA1AD`
- `text-subtle`: `#6B7280`

### Semânticos
- success `#10B981`
- warning `#F59E0B`
- danger `#EF4444`
- info `#3B82F6`

### Acentos por Agente Star Wars

Cada personagem = cor única, reconhecimento instantâneo.

| Agente | Personagem | Cor | Hex |
|---|---|---|---|
| Chief | Yoda | verde-sábio | `#84CC16` |
| Architect | Obi-Wan | azul-jedi | `#38BDF8` |
| UX-Alpha | Padmé | magenta-real | `#E879F9` |
| UX-Beta | Rey | laranja-deserto | `#FB923C` |
| Dev-Alpha | Luke | dourado-trigo | `#FACC15` |
| Dev-Beta | Leia | rosa-coral | `#F472B6` |
| Dev-Gamma | Han | âmbar-contrabandista | `#D97706` |
| Dev-Delta | Chewie | castanho-quente | `#A16207` |
| QA | Vader | roxo-profundo | `#8B5CF6` |
| DevOps | R2-D2 | ciano-elétrico | `#06B6D4` |
| Analyst | C-3PO | ouro-polido | `#EAB308` |
| Data-Engineer | Lando | cerúleo-violeta | `#6366F1` |

**Uso:** border do avatar, glow de speaking, cor da bolha user, cor da aresta de saída. **Nunca** no bg do card (ruído visual).

---

## 5. Empty State + Onboarding

Zero nodes = **hero-state cinematográfico**, não o `+Squad` genérico.

### Layout centralizado (viewport-center)
- **Arte:** grid dot-pattern do canvas se dissolve num holograma sutil de um avatar Star Wars monocromático (ciclando a cada 4s entre Yoda, Obi-Wan, Leia). Opacity 20%.
- **Título:** "Sua Sala de Comando está vazia" — `Inter 24px / 600 / tracking -0.02em`.
- **Subtítulo:** "Invoque seu primeiro agente para começar a orquestrar." — `15px / text-muted / max-width 420px`.
- **CTA primário:** botão `Invocar Chief (Yoda)` — altura 44px, padding 0 20px, bg `accent-yoda`, text `surface-0`, border-radius 10px, ícone ✨ à esquerda. Hover: translateY -1px + shadow.
- **CTA secundário (ghost):** "Escolher outro agente" — abre command palette (⌘K style, Raycast-like) com todos disponíveis, ícone, cor, role, descrição curta.
- **Atalho hint:** abaixo, micro-texto `⌘K para busca · ⌘N para novo agente` em `text-subtle`.

### Sem botão "+Squad" flutuante

Adição de novos agentes depois via:
1. **⌘K** (command palette global)
2. **Double-click** no canvas (popover in-place com search)
3. **Drag** do handle de saída para área vazia → "Create agent here" popover

---

## 6. Micro-interações

Todas com `cubic-bezier(0.4, 0, 0.2, 1)` salvo indicado. Durações curtas (respeitar `prefers-reduced-motion`).

| Interação | Animação |
|---|---|
| **Nova mensagem chega** | Bolha desliza de baixo 8px + fade 0→1 em **240ms**. Após montada, **soft glow** cor-agente no card (box-shadow 0 0 16px/20% → 0) em **1.2s** ease-out. Scroll suave para final. |
| **Agente começa a falar** | Avatar ring escala 1→1.08 em 400ms spring, halo pulsante começa. Status dot muda de verde→verde-halo. |
| **Typing indicator** | Três dots `•••` com stagger 120ms, opacity 0.3→1→0.3 em loop 1.4s. |
| **Conexão criada** | Path desenha via `stroke-dasharray` animation 500ms (traço nasce da origem até destino). Depois flash de 1 particle percorrendo. |
| **Conexão removida** | Path fade+blur 300ms, handles piscam 2× na cor-danger. |
| **Hover no handle** | Scale 1→1.4 + tooltip fade-in 150ms. Outros handles compatíveis no canvas ganham **breathing** subtle (1→1.1, 2s infinite). |
| **Drag node** | Scale 1.02 + shadow elevated, aresta follow com `requestAnimationFrame` (sem lag). Grid snap opcional com "tick" visual. |
| **Select node** | Border ganha `accent-agent` 1px + inner ring 1px `accent-agent/30%` em 120ms. |
| **Command palette abre** | Backdrop blur 8px fade 200ms, palette entra de `translateY(-8px) scale(0.98)` → normal em 240ms spring. |
| **Slash menu (/)** | Popover fade+slide 4px em 160ms. Itens com highlight `accent-agent/10%` no hover. |
| **Error state** | Shake horizontal 3× em 240ms (amp 4px). Toast inline slide-in de baixo. |
| **Node minimize/expand** | Height interpola 280ms ease-out; conteúdo interno crossfade 180ms. |

---

## 7. Referências Aplicadas

- **Linear** → sidebar density, `⌘K` palette, tipografia Inter com tracking apertado, estados "quiet" para elementos secundários.
- **Raycast** → slash-commands com ícone + shortcut chip à direita, fuzzy search instantânea, paleta monocroma + acento único por contexto.
- **Arc Browser** → superfície dark-azulada (não preto), cantos arredondados generosos, micro-glow colorido sem saturar, hover states "respirando".
- **Vercel v0** → dot-grid sutil no canvas, cards de resultado com border-radius 14px e border 1px, vazio preenchido com arte conceitual.
- **Novel editor** → bolhas com cantos assimétricos (12/12/12/4), tipografia de leitura confortável em 13-14px, slash-menu polido.

### Princípios Guia
1. Dark ≠ preto — tons `#0E1014`–`#1C2029` descansam o olho em sessões longas.
2. Cor é identidade, não decoração — acento só onde reforça reconhecimento do agente.
3. Movimento carrega significado — cada animação comunica estado, nunca é gratuita.
4. Densidade calibrada — tipografia 13-14px, paddings 8-16px, nada aeroportuário.
5. Handles e conexões são protagonistas — a metáfora n8n só funciona se o cabo for elegante.

---

## Próximos Entregáveis Recomendados

- `tokens.json` W3C DTCG com toda paleta + escala tipográfica + spacing.
- Specs de componente React (`TerminalNode` → `ChatNode`, Handle variants, Edge variants).
- Wireframes hi-fi do empty-state e de uma cena com 5 agentes conectados.

**Handoff:**
- Implementação → Luke (Dev-Alpha)
- Validação de flows / research → Rey (UX-Beta)
- Revisão de arquitetura de componentes → Obi-Wan (Architect)

— Padmé, elegance is power 🎨👑
