# AgentChatNode — Anatomia e Spec de Implementação

**Autor:** Padmé (UX-Alpha — UI Design Specialist)
**Data:** 2026-04-14
**Epic:** 9 — Sala de Comando v2
**Handoff para:** Luke (Dev-Alpha) — story 9.5
**Tokens:** `packages/ui/tokens.css`

---

## 1. Dimensões

| Estado | Largura | Altura | Quando |
|---|---|---|---|
| **Base** | 360px | 280px | Default (poucos msgs) |
| **Colapsado** | 360px | 88px | Click no header ou `*minimize` |
| **Expandido** | 420px | 520px | Quando chat cresce / usuário expande |

- `border-radius: 14px` (`--sc-node-radius`) em todos os estados
- `border: 1px solid var(--sc-surface-300)` base; varia por estado (§4)
- Resize entre estados: `transition: width var(--sc-duration-resize) var(--sc-ease-out), height var(--sc-duration-resize) var(--sc-ease-out)` com crossfade interno em 180ms

---

## 2. Estrutura interna (top → bottom)

```
┌──────────────────────────────────── 360px ───────────────────────────────────┐
│ HEADER (56px) ·················································· padding 12/16 │
│  [●] avatar 36px  Nome — Role                              [⋯] menu          │
│       status-dot 8px (canto sup-dir do avatar)                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ MESSAGES (flex-1, overflow-y auto, padding 12/16, gap 8px)                   │
│  ··· bolhas ···                                                               │
│  gradient-fade 24px no topo quando há overflow                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ INPUT (48px) ······················································ padding 8/12 │
│  [ Fale com {Nome}… ou / para comandos           ] [@ ] [⏎] [⌘↵]            │
├──────────────────────────────────────────────────────────────────────────────┤
│ HANDLES (visualmente sobrepostos às bordas do card, não ocupam altura)        │
│  ◉ entrada (esquerda-meio)   ◉ saída (direita-meio)   ◆ broadcast (topo-centro)│
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Header (56px)

```
padding: var(--sc-node-header-padding); /* 12px 16px */
height:  var(--sc-node-header-height);  /* 56px */
display: flex; align-items: center; gap: 10px;
```

| Sub-elemento | Spec |
|---|---|
| **Avatar** | `width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--sc-agent-color)` |
| **Status dot** | `width: 8px; height: 8px; border-radius: 50%; position: absolute; top: 0; right: 0; outline: var(--sc-status-dot-ring)` |
| **Nome** | `font: 600 14px/1.2 var(--sc-font-sans); letter-spacing: -0.01em; color: var(--sc-text-primary)` |
| **Role** | `font: 400 12px/1.4 var(--sc-font-sans); color: var(--sc-text-muted)` |
| **Menu kebab** | `margin-left: auto; opacity: 0; transition: opacity 150ms`; aparece no hover do card |

**Drag handle:** só o header tem `dragHandle` prop do React Flow. O resto do card recebe `nodrag`.

### 2.2 Área de Mensagens

```
flex: 1;
overflow-y: auto;
padding: var(--sc-msg-padding);  /* 12px 16px */
gap:     var(--sc-msg-gap);      /* 8px */
```

**Bolha user (direita):**
```css
background:    var(--sc-agent-bubble); /* --sc-agent-{slug}-bubble */
border-radius: var(--sc-bubble-radius-user); /* 12px 12px 4px 12px */
padding:       var(--sc-bubble-padding);
max-width:     var(--sc-msg-max-width);
align-self:    flex-end;
font:          400 13px/1.5 var(--sc-font-sans);
color:         var(--sc-text-primary);
```

**Bolha agente (esquerda):**
```css
background:    var(--sc-surface-200);
border-radius: var(--sc-bubble-radius-agent); /* 12px 12px 12px 4px */
/* demais props idênticas mas align-self: flex-start */
```

**Timestamp** (dentro de cada bolha, hover-only):
```css
font:    400 11px/1 var(--sc-font-sans);
color:   var(--sc-text-subtle);
opacity: 0;
transition: opacity 150ms var(--sc-ease-standard);
/* parent:hover > & { opacity: 1 } */
```

**Code block interno:**
```css
background:    var(--sc-surface-400);
font:          400 12px/1.6 var(--sc-font-mono);
border-radius: 6px;
padding:       8px;
```

**Gradient fade topo** (quando overflow):
```css
/* pseudo-element ::before no container */
background: linear-gradient(to bottom, var(--sc-surface-100), transparent);
height: 24px; pointer-events: none; position: sticky; top: 0;
```

**Scroll:** `overflow-y: auto; scrollbar-width: thin` — reutiliza `::-webkit-scrollbar` de `globals.css`. Adicionar classe `nodrag` no container (armadilha §6.1 do plano mestre).

### 2.3 Input (48px)

```css
height:        var(--sc-input-height);    /* 48px */
padding:       var(--sc-input-padding);   /* 8px 12px */
border-radius: var(--sc-input-radius);    /* 10px */
background:    var(--sc-surface-200);
border:        1px solid var(--sc-surface-300);
font:          400 13px/1.5 var(--sc-font-sans);
color:         var(--sc-text-primary);
```

Adicionar `nowheel` no wrapper do input (armadilha §6.1 — scroll do chat não deve dar zoom no canvas).

Atalhos de teclado:
- `⏎` → enviar mensagem
- `⌘↵` → enviar sem confirmação
- `/` no início → abre slash-command popover (Raycast-style, fuzzy)
- `@` → mention de outro agente no canvas

**`deleteKeyCode={null}`** no ReactFlow wrapper OU filtrar `Backspace` enquanto o input tem foco para não deletar o node (armadilha #4 do plano mestre).

### 2.4 Handles

| Handle | Posição | Forma | Cor | Tooltip |
|---|---|---|---|---|
| **Entrada** | `position: 'left', id: 'in'` | Círculo 10px | `border: 2px solid var(--sc-agent-color); fill: var(--sc-surface-100)` | "Receber de…" |
| **Saída** | `position: 'right', id: 'out'` | Círculo 10px | `border: 2px solid var(--sc-agent-color); fill: var(--sc-agent-color)` | "Enviar para…" |
| **Broadcast** | `position: 'top', id: 'broadcast'` | Diamante (rotate 45°) 12px | `border: 2px solid var(--sc-agent-color); fill: var(--sc-surface-100)` | "Broadcast" |

**Hover:** `width: var(--sc-handle-size-hover)` (14px) + tooltip fade 150ms.
**Drag ativo em outro handle:** animação `sc-handle-breathe` (2s infinite) nos handles compatíveis restantes.

---

## 3. Props do componente React

```tsx
interface AgentChatNodeProps {
  data: {
    agentId:     string;       // slug: 'chief', 'architect', etc.
    displayName: string;       // 'Yoda — Chief'
    role:        string;       // 'Squad Orchestrator'
    agentColor:  string;       // hex: '#84CC16'
    agentGlow:   string;       // rgba: 'rgba(132, 204, 22, 0.25)'
    agentBubble: string;       // rgba: 'rgba(132, 204, 22, 0.12)'
    avatarUrl?:  string;       // se houver; fallback = iniciais
    state:       AgentState;   // 'online' | 'thinking' | 'speaking' | 'idle' | 'error'
    isChief?:    boolean;      // is_chief=1 — Chief tem destaque sutil mas é card normal
    messages:    ChatMessage[];
  };
  selected?: boolean;
}

type AgentState = 'online' | 'thinking' | 'speaking' | 'idle' | 'error';

interface ChatMessage {
  id:        string;
  role:      'user' | 'agent';
  content:   string;
  createdAt: string; // ISO
  streaming?: boolean;
}
```

**CSS custom props inline no node** (para que tokens de cor cascateiem):
```tsx
<div
  style={{
    '--sc-agent-color':     data.agentColor,
    '--sc-agent-glow':      data.agentGlow,
    '--sc-agent-bubble':    data.agentBubble,
  } as React.CSSProperties}
>
```

---

## 4. Cinco estados visuais

### 4.1 `online`

| Elemento | Visual |
|---|---|
| **Status dot** | `background: var(--sc-success)` sólido, sem animação |
| **Avatar ring** | `border: 2px solid var(--sc-agent-color)` estático |
| **Card border** | `1px solid var(--sc-surface-300)` |
| **Opacity** | 1 |
| **Extra** | — |

### 4.2 `thinking`

| Elemento | Visual |
|---|---|
| **Status dot** | `background: var(--sc-warning)` + `animation: sc-dot-pulse 1s var(--sc-ease-standard) infinite` |
| **Avatar ring** | pseudo-element com gradiente rotativo + `animation: sc-ring-shimmer 2s linear infinite` |
| **Card border** | `1px solid var(--sc-surface-300)` (sem glow) |
| **Opacity** | 1 |
| **Extra** | Typing indicator "•••" no footer: 3 spans com `animation: sc-typing-dot var(--sc-duration-typing) var(--sc-ease-standard) infinite` e delays 0ms / 120ms / 240ms |

**Shimmer ring** (pseudo-element sobre avatar):
```css
.avatar-ring--thinking::after {
  content: '';
  position: absolute; inset: -2px;
  border-radius: 50%;
  background: conic-gradient(
    var(--sc-agent-color) 0deg,
    transparent 120deg,
    var(--sc-agent-color) 240deg,
    transparent 360deg
  );
  animation: sc-ring-shimmer 2s linear infinite;
  opacity: 0.7;
}
```

### 4.3 `speaking`

| Elemento | Visual |
|---|---|
| **Status dot** | `background: var(--sc-success)` + halo pulsante: `animation: sc-halo-pulse 1.5s ease-in-out infinite` |
| **Avatar ring** | `animation: sc-ring-spring var(--sc-duration-slow) var(--sc-ease-spring) forwards` (onset) + halo pulsante `animation: sc-halo-pulse 1.5s ease-in-out infinite` |
| **Card border** | `1px solid var(--sc-agent-color)` + `box-shadow: 0 0 0 1px var(--sc-agent-color), 0 0 16px var(--sc-agent-glow)` |
| **Opacity** | 1 |
| **Extra** | Última bolha agente tem cursor blinking no final: `::after { content: '▊'; animation: blink 1s step-end infinite }` |

### 4.4 `idle`

| Elemento | Visual |
|---|---|
| **Status dot** | `background: #71717A` (zinc-500), semi-opaco `opacity: 0.7` |
| **Avatar ring** | `border: 2px solid var(--sc-agent-color); opacity: 0.5` |
| **Card border** | `1px solid var(--sc-surface-300)` |
| **Opacity** | `var(--sc-opacity-idle)` = 0.92 (card inteiro) |
| **Extra** | — |

### 4.5 `error`

| Elemento | Visual |
|---|---|
| **Status dot** | `background: var(--sc-danger)` sólido |
| **Avatar ring** | `border: 2px solid var(--sc-danger)` |
| **Card border** | `var(--sc-border-node-error)` = `1px solid rgba(239,68,68,0.6)` + `box-shadow: inset 0 0 12px rgba(239,68,68,0.1)` |
| **Opacity** | 1 |
| **Extra** | Toast inline no footer: "Conexão perdida · retry" (slide-in de baixo); onset do card: `animation: sc-shake var(--sc-duration-normal) var(--sc-ease-standard)` |

---

## 5. Animações de mensagens e transições

### Nova mensagem chega

```css
.sc-bubble-enter {
  animation: sc-bubble-in var(--sc-duration-normal) var(--sc-ease-spring);
}
```

Após montada, glow no card:
```css
.sc-card--message-received {
  animation: sc-card-glow-out var(--sc-duration-glow) var(--sc-ease-out);
}
```

### Collapse / Expand

```css
.sc-node {
  transition:
    width  var(--sc-duration-resize) var(--sc-ease-out),
    height var(--sc-duration-resize) var(--sc-ease-out);
}
/* conteúdo interno crossfade */
.sc-node__body {
  transition: opacity 180ms var(--sc-ease-standard);
}
.sc-node--collapsing .sc-node__body { opacity: 0; }
```

### Drag

```css
.sc-node--dragging {
  transform:  scale(1.02);
  box-shadow: var(--sc-shadow-drag);
  transition: transform 100ms var(--sc-ease-spring),
              box-shadow 100ms var(--sc-ease-spring);
}
```

### Select

```css
.sc-node--selected {
  border-color: var(--sc-agent-color);
  box-shadow:   0 0 0 1px var(--sc-agent-color),
                inset 0 0 0 1px rgba(var(--sc-agent-color-rgb, 255 255 255) / 0.3);
  transition:   border-color var(--sc-duration-instant) var(--sc-ease-standard),
                box-shadow   var(--sc-duration-instant) var(--sc-ease-standard);
}
```

---

## 6. Checklist para Luke (story 9.5)

- [ ] `nodrag` no container de mensagens (evita arrastar ao selecionar texto)
- [ ] `nowheel` no input e na área de mensagens (evita zoom ao rolar chat)
- [ ] `dragHandle` apontando só para o header
- [ ] `deleteKeyCode={null}` no ReactFlow OU guard no `onKeyDown` do input
- [ ] Input state no Zustand/ref fora de `data` prop (evitar bug de re-render — §6.1 do plano mestre, `CanvasView.tsx:100-109`)
- [ ] `useMemo` nos nodes data para evitar reconstituição em cada render
- [ ] `scroll-to-bottom` ao nova mensagem (com `requestAnimationFrame`, não `setTimeout`)
- [ ] Virtualização de mensagens com `react-virtuoso` quando lista > 100 msgs
- [ ] LOD a zoom < 0.4 — mostrar card degradado com 3 últimas mensagens
- [ ] `prefers-reduced-motion` respeitado em todas as animations (já no tokens.css)

---

## 7. Localização dos tokens no CSS

```css
/* Forma de consumo — exemplo em AgentChatNode.module.css */
.card {
  width:         var(--sc-node-width-base);
  height:        var(--sc-node-height-base);
  border-radius: var(--sc-node-radius);
  border:        var(--sc-border-node);
  background:    var(--sc-surface-100);
  font-family:   var(--sc-font-sans);
  color:         var(--sc-text-primary);
}
```

Tailwind integration (no `tailwind.config.ts`):
```ts
theme: {
  extend: {
    colors: {
      'sc-surface': {
        0:   'var(--sc-surface-0)',
        100: 'var(--sc-surface-100)',
        200: 'var(--sc-surface-200)',
        300: 'var(--sc-surface-300)',
        400: 'var(--sc-surface-400)',
      },
      // ... acentos por agente conforme precisar
    }
  }
}
```

---

*— Padmé, elegance is power 🎨👑*
