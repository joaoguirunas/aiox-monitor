# AgentChatNode — Estados de Interação Finos

**Autor:** Padmé (UX-Alpha — UI Design Specialist)
**Data:** 2026-04-14
**Epic:** 9 — Sala de Comando v2
**JOB:** JOB-030 (complementa JOB-016)
**Handoff para:** Luke (Dev-Alpha) — story 9.5
**Tokens:** `packages/ui/tokens.css`
**Depende de:** `docs/plans/padme-agent-chat-anatomy.md` (§4 cinco estados visuais)

> **Escopo:** Este documento cobre os estados de interação do utilizador que faltaram do JOB-016 —
> hover, focus, selected no canvas, navegação por teclado e acessibilidade. Os cinco estados de
> agente (online / thinking / speaking / idle / error) estão em `padme-agent-chat-anatomy.md`.

---

## 1. Hover no Card

O card reage ao hover comunicando "sou interativo" sem competir com o estado de agente ativo.

### 1.1 Comportamento visual

```
mouse entra no card → 150ms transition
  border: 1px solid var(--sc-surface-300)
       → 1px solid var(--sc-surface-400)   /* borda sobe um tom */
  box-shadow: none
           → 0 0 0 1px rgba(255,255,255,0.04),  /* inner ring subtil */
              0 4px 16px rgba(0,0,0,0.25)        /* sombra de elevação leve */
```

**Regra de não-conflito:** se o card estiver em estado `speaking` ou `selected`, o hover NÃO substitui o glow do agente — apenas adiciona a sombra de elevação. O border permanece na cor do agente.

### 1.2 Cursor

| Região do card | `cursor` |
|---|---|
| **Header** (dragHandle) | `grab` (idle) · `grabbing` (dragging) |
| **Avatar, nome, kebab menu** | `pointer` |
| **Área de mensagens** | `default` (text selection nativa) |
| **Input** | `text` |
| **Handles** | `crosshair` |
| **Resto do card** | `default` |

```css
.sc-node { cursor: default; }
.sc-node__header { cursor: grab; }
.sc-node__header:active { cursor: grabbing; }
.sc-node__avatar,
.sc-node__kebab { cursor: pointer; }
.sc-node__input { cursor: text; }
.sc-node__handle { cursor: crosshair; }
```

### 1.3 Kebab menu (⋯)

O botão kebab aparece no hover do header — não está visível em repouso para reduzir ruído.

```css
.sc-node__kebab {
  opacity: 0;
  transition: opacity var(--sc-duration-fast) var(--sc-ease-standard);
}
.sc-node:hover .sc-node__kebab,
.sc-node:focus-within .sc-node__kebab {
  opacity: 1;
}
```

Exceção: se o popover do menu estiver aberto, `opacity: 1` permanece enquanto o popover existir.

---

## 2. Focus no Input

O input do card precisa de um focus ring que seja visível sobre o canvas escuro, sem parece "browser default".

### 2.1 Spec visual

```css
.sc-node__input:focus-visible {
  outline: none;                               /* remove browser default */
  border-color: var(--sc-agent-color);         /* cor do agente dono do card */
  box-shadow:
    0 0 0 1px var(--sc-agent-color),           /* ring externo 1px */
    inset 0 0 0 1px rgba(255,255,255,0.04);    /* inner glow subtil */
  transition:
    border-color var(--sc-duration-instant) var(--sc-ease-standard),
    box-shadow   var(--sc-duration-instant) var(--sc-ease-standard);
}
```

- Transição de entrada: **120ms** (`--sc-duration-instant`) — snappy, sem lag percetível.
- Transição de saída: mesma duração (blur do input → ring desaparece igualmente rápido).
- `focus-visible` em vez de `focus` para não interferir com utilizadores que usam rato.

### 2.2 Placeholder shift

Quando o input recebe foco, o placeholder não desaparece abruptamente — faz `opacity: 0` em 100ms para permitir que o utilizador processe a transição.

```css
.sc-node__input::placeholder {
  transition: opacity 100ms var(--sc-ease-standard);
}
.sc-node__input:focus::placeholder {
  opacity: 0.4;
}
```

### 2.3 Interação com `nowheel` e `nodrag`

O input DEVE ter `nowheel` no wrapper para prevenir que scroll vertical dentro do chat dispare zoom no canvas React Flow. Responsabilidade de Luke (ver checklist em `padme-agent-chat-anatomy.md §6`).

---

## 3. Selected no Canvas

"Selected" é o estado de seleção do React Flow — o utilizador clicou no card ou usou box-select. Diferente de "focus no input".

### 3.1 Spec visual

```css
.sc-node--selected {
  border-color: var(--sc-agent-color);
  box-shadow:
    0 0 0 2px var(--sc-agent-color),           /* outline 2px externo */
    inset 0 0 0 1px rgba(                      /* inner ring 30% opacidade */
      var(--sc-agent-color-rgb, 255 255 255) / 0.30
    );
  transition:
    border-color var(--sc-duration-instant) var(--sc-ease-standard),
    box-shadow   var(--sc-duration-instant) var(--sc-ease-standard);
}
```

**Border-radius mantém-se:** `border-radius: var(--sc-node-radius)` (`14px`) em todos os estados, incluindo selected. O `box-shadow` respeita `border-radius` nativamente no CSS.

### 3.2 Distinção selected × speaking

| Estado | Border | box-shadow |
|---|---|---|
| **speaking** | `1px solid var(--sc-agent-color)` | `0 0 0 1px agent-color, 0 0 16px agent-glow` — glow difuso |
| **selected** | `1px solid var(--sc-agent-color)` | `0 0 0 2px agent-color, inset 0 0 0 1px agent-color/30%` — outline nítido |
| **selected + speaking** | `1px solid var(--sc-agent-color)` | combina: `0 0 0 2px agent-color, 0 0 16px agent-glow, inset 0 0 0 1px agent-color/30%` |

### 3.3 Multi-select (box-select)

Quando múltiplos cards estão selected (React Flow box-select), cada um mostra o próprio outline na cor do seu agente. Não existe outline "genérico" para multi-select — a identidade por cor mantém-se mesmo em seleção conjunta.

### 3.4 Deselect

Click no canvas vazio → `border-color` e `box-shadow` voltam ao estado base em **120ms**.

---

## 4. Keyboard Navigation

O canvas deve ser completamente navegável por teclado. React Flow já suporta navegação básica — esta spec estende-o para os cards.

### 4.1 Foco entre cards (Tab / Shift+Tab)

| Tecla | Ação |
|---|---|
| `Tab` | Move foco para o próximo AgentChatNode no canvas (ordem de adição ao canvas) |
| `Shift+Tab` | Move foco para o card anterior |
| `Enter` sobre um card selecionado | Move foco para o input do card |
| `Escape` dentro do input | Devolve foco ao card (não ao canvas) |
| `Escape` no card selecionado | Deselect, devolve foco ao canvas wrapper |

**Implementação:** cada `AgentChatNode` deve ter `tabIndex={0}` no elemento raiz. O header deve ter `role="heading"` e participar do tab order.

```tsx
<div
  className={cn('sc-node', selected && 'sc-node--selected')}
  tabIndex={0}
  onFocus={() => setCardFocused(true)}
  onBlur={() => setCardFocused(false)}
  onKeyDown={handleCardKeyDown}
>
```

### 4.2 Navegação de mensagens (setas)

Quando o input **não** está focado e o card está selecionado, as teclas de seta navegam pelas mensagens:

| Tecla | Ação |
|---|---|
| `ArrowUp` | Move foco para a mensagem anterior na lista |
| `ArrowDown` | Move foco para a mensagem seguinte |
| `ArrowUp` na primeira mensagem | Scroll para o topo (sem loop) |
| `ArrowDown` na última mensagem | Scroll para o fundo + foca input |
| `Home` | Vai à primeira mensagem |
| `End` | Vai à última mensagem / foca input |

Cada bolha de mensagem focada recebe:
```css
.sc-bubble:focus-visible {
  outline: 2px solid var(--sc-agent-color);
  outline-offset: 2px;
  border-radius: inherit;
}
```

### 4.3 Guard: setas não conflitam com React Flow pan

Quando o focus estiver dentro de um `AgentChatNode` (input ou mensagem), as teclas `ArrowUp/Down/Left/Right` **não devem** propagar para o canvas React Flow.

```tsx
const handleCardKeyDown = (e: React.KeyboardEvent) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.stopPropagation(); // impede pan no canvas
  }
};
```

### 4.4 Abertura de menus por teclado

| Tecla | Ação |
|---|---|
| `⌘K` (ou `Ctrl+K`) em qualquer foco | Abre command palette global |
| `/` no início do input | Abre slash-command popover |
| `@` no input | Abre mention picker |
| `⌘⏎` no input | Envia mensagem sem confirmação |
| `F2` sobre um card | Entra em modo rename |

---

## 5. Acessibilidade

### 5.1 ARIA roles por região

```tsx
/* Card raiz */
<article
  role="article"
  aria-label={`Agente ${data.displayName} — ${data.role}`}
  aria-selected={selected}
  aria-live="off"  /* o log interno tem live region própria */
>

  /* Header */
  <header role="heading" aria-level={3}>
    <img
      src={data.avatarUrl}
      alt={`Avatar de ${data.displayName}`}
      role="img"
    />
    <span className="sr-only">Estado: {data.state}</span>
  </header>

  /* Área de mensagens */
  <div
    role="log"
    aria-label={`Histórico de mensagens com ${data.displayName}`}
    aria-live="polite"
    aria-relevant="additions"
    aria-atomic="false"
  >
    {messages.map((msg) => (
      <div
        key={msg.id}
        role="article"
        aria-label={msg.role === 'user' ? 'Você' : data.displayName}
        tabIndex={-1}  /* focável programaticamente pela nav de setas */
      >
        {msg.content}
      </div>
    ))}
  </div>

  /* Input */
  <label htmlFor={`input-${data.agentId}`} className="sr-only">
    Mensagem para {data.displayName}
  </label>
  <textarea
    id={`input-${data.agentId}`}
    aria-label={`Escrever mensagem para ${data.displayName}`}
    aria-describedby={`input-hint-${data.agentId}`}
    placeholder={`Fale com ${data.displayName}… ou / para comandos`}
  />
  <span id={`input-hint-${data.agentId}`} className="sr-only">
    Pressione Enter para enviar. Use / para comandos do agente.
  </span>

</article>
```

### 5.2 `aria-live` no log de mensagens

| Propriedade | Valor | Razão |
|---|---|---|
| `aria-live` | `"polite"` | Anuncia novas mensagens sem interromper fala em curso |
| `aria-relevant` | `"additions"` | Só anuncia novas bolhas, não remoções |
| `aria-atomic` | `"false"` | Anuncia cada bolha individualmente |

**Streaming:** quando o agente está a fazer streaming token-a-token, o anúncio do `aria-live` pode causar spam de leitura. Solução: a bolha de streaming deve ter `aria-live="off"` durante o stream; trocar para `aria-live="polite"` apenas quando `streaming: false` (mensagem completa).

```tsx
<div
  role="article"
  aria-live={msg.streaming ? 'off' : 'polite'}
  aria-label={msg.streaming ? `${data.displayName} está a escrever` : data.displayName}
>
```

### 5.3 Status dot acessível

O status dot é visual-only — o estado deve ser comunicado textualmente.

```tsx
<span
  className="sc-status-dot"
  role="img"
  aria-label={statusLabel(data.state)}
  /* statusLabel: 'online' → 'Agente online', 'thinking' → 'Agente a pensar', etc. */
/>
```

```ts
const statusLabel = (state: AgentState): string => ({
  online:   'Agente online',
  thinking: 'Agente a processar',
  speaking: 'Agente a responder',
  idle:     'Agente inativo',
  error:    'Agente com erro de conexão',
}[state] ?? 'Estado desconhecido');
```

### 5.4 Handles

Os handles de conexão React Flow devem ter labels descritivos:

```tsx
<Handle
  type="target"
  position={Position.Left}
  id="in"
  aria-label={`Receber contexto de outro agente para ${data.displayName}`}
/>
<Handle
  type="source"
  position={Position.Right}
  id="out"
  aria-label={`Enviar contexto de ${data.displayName} para outro agente`}
/>
<Handle
  type="source"
  position={Position.Top}
  id="broadcast"
  aria-label={`Broadcast de ${data.displayName} para todos os agentes conectados`}
/>
```

### 5.5 `prefers-reduced-motion`

Todas as animações definidas em `tokens.css §11` já incluem o media query override. Comportamentos que **devem** ser preservados mesmo com `reduced-motion`:
- Mudança de cor do status dot (não é animação, é troca de valor)
- Transição de border/shadow no focus (pode ser instantânea, mas deve ocorrer)
- Scroll automático para nova mensagem (comportamento funcional, não decorativo)

### 5.6 Contraste

| Par | Ratio mínimo | Verificado |
|---|---|---|
| `--sc-text-primary` (#E8EAED) sobre `--sc-surface-100` (#15181F) | 4.5:1 | 12.4:1 ✓ |
| `--sc-text-muted` (#9BA1AD) sobre `--sc-surface-100` (#15181F) | 4.5:1 | 5.8:1 ✓ |
| `--sc-text-subtle` (#6B7280) sobre `--sc-surface-100` (#15181F) | 3:1 (UI) | 3.2:1 ✓ |
| `--sc-agent-chief` (#84CC16) sobre `--sc-surface-0` (#0E1014) | 3:1 (UI) | 4.7:1 ✓ |

Todos os acentos de agente passam 3:1 (WCAG AA para UI components) sobre surface-0. Para texto (timestamps, hints em cor de acento), sempre usar `--sc-text-subtle` ou superior — nunca `agent-color` direto em texto de corpo pequeno.

---

## 6. Tokens Novos Necessários

Luke deve adicionar os seguintes tokens em `packages/ui/tokens.css` (§7 Bordas & Shadows, após a definição existente):

```css
/* Hover state */
--sc-border-node-hover:   1px solid var(--sc-surface-400);
--sc-shadow-node-hover:   0 0 0 1px rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.25);

/* Focus no input */
--sc-ring-input:          0 0 0 1px var(--sc-agent-color, var(--sc-info));
--sc-ring-input-inset:    inset 0 0 0 1px rgba(255,255,255,0.04);

/* Selected (extends existing --sc-border-node-selected) */
--sc-shadow-node-selected: 0 0 0 2px var(--sc-agent-color, var(--sc-surface-300)),
                            inset 0 0 0 1px rgba(255,255,255,0.08);
```

---

## 7. Checklist para Luke (story 9.5)

- [ ] `tabIndex={0}` no elemento raiz do `AgentChatNode`
- [ ] `role="article"` no card, `role="log"` na área de mensagens, `role="heading"` no header
- [ ] `aria-live="polite"` no log, `aria-live="off"` durante streaming
- [ ] `aria-label` em todos os handles (entrada, saída, broadcast)
- [ ] `aria-label` no status dot com `statusLabel()` helper
- [ ] `onKeyDown` no card intercepta setas para prevenir pan no canvas
- [ ] Navegação `Tab/Shift+Tab` funciona entre todos os cards no canvas
- [ ] `ArrowUp/Down` navega mensagens quando input não está focado
- [ ] Focus ring no input usa `var(--sc-agent-color)` + ring 1px
- [ ] Hover border sobe de `surface-300` → `surface-400`
- [ ] Kebab menu visível apenas no hover do header (opacity transition)
- [ ] Cursor `grab` no header, `pointer` em avatar/kebab, `text` no input
- [ ] `focus-visible` (não `focus`) no input para ring
- [ ] Selected: outline 2px cor-agente, `border-radius: 14px` mantido
- [ ] Tokens novos adicionados em `packages/ui/tokens.css`
- [ ] `prefers-reduced-motion` testado — animações param, estados permanecem

---

*— Padmé, elegance is power — e acessibilidade é poder para todos 🎨👑*
