# Sala de Comando v2 — Empty State Hero

**Autor:** Padmé (UX-Alpha — UI Design Specialist)
**Data:** 2026-04-14
**Epic:** 9 — Sala de Comando v2
**JOB:** JOB-030
**Handoff para:** Luke (Dev-Alpha) — story 9.8
**Tokens:** `packages/ui/tokens.css`
**Depende de:** `docs/plans/padme-ui.md §5` (visão original), `docs/plans/padme-agent-chat-anatomy.md`

> **Escopo:** Spec completa do empty state exibido quando `nodes.length === 0` no canvas.
> Inclui layout, holograma, CTAs, copy, animação de saída e responsividade até 768px.

---

## 1. Quando Aparece / Desaparece

```
nodes.length === 0  →  Hero renderiza (com fade-in 300ms)
nodes.length === 1  →  Hero faz fade-out 400ms → unmount
```

A transição é controlada por um booleano derivado do store Zustand:

```ts
const showHero = useCanvasStore((s) => s.nodes.length === 0);
```

O componente `<EmptyStateHero>` deve ser envolto num `AnimatePresence` (Framer Motion) ou num CSS `transition` de `opacity + pointer-events` para que o fade-out ocorra antes do unmount:

```css
.sc-hero {
  opacity: 1;
  transition: opacity var(--sc-duration-slow) var(--sc-ease-out); /* 400ms */
  pointer-events: auto;
}
.sc-hero--exiting {
  opacity: 0;
  pointer-events: none;
}
```

---

## 2. Layout Geral

### 2.1 Posicionamento

O hero ocupa o viewport inteiro do canvas — `position: absolute; inset: 0` — centralizado com:

```css
.sc-hero {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;                        /* gap controlado internamente por seções */
  pointer-events: none;          /* canvas ainda captura scroll/drag no fundo */
  z-index: 10;                   /* acima do dot-grid, abaixo dos nodes */
}

.sc-hero__content {
  pointer-events: auto;          /* reativa eventos para as seções interativas */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  max-width: 480px;
  padding: 0 24px;
  text-align: center;
}
```

### 2.2 Camadas (bottom → top)

```
z: canvas dot-grid (background)
z: holograma (opacity 20%, blur 1px)
z: conteúdo textual + CTAs
z: hint de atalho
```

---

## 3. Holograma Ciclando

### 3.1 Comportamento

Três "frames" ciclam em sequência com crossfade suave. Cada frame é a silhueta do personagem em monocromático:

| Frame | Personagem | Cor da silhueta |
|---|---|---|
| 0 | Yoda | `var(--sc-agent-chief)` = `#84CC16` |
| 1 | Obi-Wan | `var(--sc-agent-architect)` = `#38BDF8` |
| 2 | Leia | `var(--sc-agent-dev-beta)` = `#F472B6` |

### 3.2 Spec visual

```css
.sc-hero__hologram {
  position: relative;
  width: 180px;
  height: 220px;
  margin-bottom: 32px;
}

.sc-hero__hologram-frame {
  position: absolute;
  inset: 0;
  opacity: 0;
  filter: blur(1px) saturate(0);    /* monocromático */
  transition:
    opacity 800ms var(--sc-ease-standard),
    transform 800ms var(--sc-ease-standard);
}

.sc-hero__hologram-frame--active {
  opacity: 0.20;                     /* sempre 20% — nunca mais */
  animation: sc-hologram-breathe 4s var(--sc-ease-standard) infinite;
}

.sc-hero__hologram-frame--exiting {
  opacity: 0;
  transform: scale(0.97);
}
```

**Animação de respiração** (`breathe`):
```css
@keyframes sc-hologram-breathe {
  0%, 100% {
    transform: scale(1);
    opacity: 0.20;
  }
  50% {
    transform: scale(1.02);
    opacity: 0.22;
  }
}
```

### 3.3 Ciclo de frames

Intervalo: **4 segundos** por frame. Transição cruzada de 800ms.

```ts
const HOLOGRAM_FRAMES = ['chief', 'architect', 'dev-beta'] as const;
const FRAME_INTERVAL = 4000; // ms

// Em useEffect, cicla com setInterval:
// a cada 4s, o frame ativo faz opacity 0 → o próximo faz opacity 0.20
// sem pular (fade-out do atual + fade-in do próximo em paralelo)
```

### 3.4 Overlay de cor

A cor do personagem deve ser aplicada como `color` CSS e o SVG/imagem deve usar `currentColor` para fills. Assim, a transição de frame muda a cor automaticamente:

```tsx
<div
  className={cn(
    'sc-hero__hologram-frame',
    index === activeFrame && 'sc-hero__hologram-frame--active',
  )}
  style={{ color: `var(--sc-agent-${frame})` }}
>
  <AgentSilhouette agent={frame} />
</div>
```

### 3.5 `prefers-reduced-motion`

Com `prefers-reduced-motion: reduce`, o breathe para mas o crossfade de ciclo persiste (é informação, não decoração). Caso o utilizador prefira sem qualquer movimento, os três frames ficam sobrepostos a opacity 0.07 cada (soma ≈ 0.20):

```css
@media (prefers-reduced-motion: reduce) {
  .sc-hero__hologram-frame--active {
    animation: none;
    opacity: 0.07;         /* todos visíveis simultaneamente, fundidos */
  }
}
```

---

## 4. Copy

### 4.1 Título

```
"Sua Sala de Comando está vazia"
```

```css
.sc-hero__title {
  font: var(--sc-font-semibold) 24px/1.2 var(--sc-font-sans);
  letter-spacing: var(--sc-tracking-tighter);  /* -0.02em */
  color: var(--sc-text-primary);
  margin: 0 0 8px 0;
}
```

### 4.2 Subtítulo principal

```
"Do or do not. Invoque para começar."
```

```css
.sc-hero__subtitle {
  font: var(--sc-font-regular) 15px/1.5 var(--sc-font-sans);
  color: var(--sc-text-muted);
  max-width: 360px;
  margin: 0 0 32px 0;
}
```

### 4.3 Hint de teclado (abaixo dos CTAs)

```
⌘K para buscar · ⌘N para novo agente
```

```css
.sc-hero__hint {
  font: var(--sc-font-regular) 11px/1.4 var(--sc-font-sans);
  color: var(--sc-text-subtle);
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sc-hero__hint kbd {
  font: var(--sc-font-medium) 10px/1 var(--sc-font-mono);
  background: var(--sc-surface-300);
  border: 1px solid var(--sc-surface-400);
  border-radius: 4px;
  padding: 2px 5px;
  color: var(--sc-text-muted);
}
```

---

## 5. CTAs

### 5.1 CTA Primário — "Invocar Chief (Yoda)"

**Um clique** cria o card do Chief no centro do canvas (posição `{ x: canvasCenter.x - 180, y: canvasCenter.y - 140 }`).

```css
.sc-hero__cta-primary {
  height: 44px;
  padding: 0 20px;
  background: var(--sc-agent-chief);       /* #84CC16 — verde Yoda */
  color: var(--sc-surface-0);              /* #0E1014 — dark para contraste */
  border: none;
  border-radius: 10px;
  font: var(--sc-font-semibold) 14px/1 var(--sc-font-sans);
  letter-spacing: -0.01em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition:
    transform var(--sc-duration-fast) var(--sc-ease-spring),
    box-shadow var(--sc-duration-fast) var(--sc-ease-spring),
    background var(--sc-duration-instant) var(--sc-ease-standard);
}

.sc-hero__cta-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px var(--sc-agent-chief-glow);
}

.sc-hero__cta-primary:active {
  transform: translateY(0);
  box-shadow: none;
}

.sc-hero__cta-primary:focus-visible {
  outline: 2px solid var(--sc-agent-chief);
  outline-offset: 3px;
}
```

**Ícone:** ✨ à esquerda (tamanho 16px, `aria-hidden="true"`).

**Label acessível:**
```tsx
<button
  className="sc-hero__cta-primary"
  onClick={handleInvokeChief}
  aria-label="Invocar agente Chief — Yoda, Orquestrador de Squad"
>
  <span aria-hidden="true">✨</span>
  Invocar Chief (Yoda)
</button>
```

### 5.2 CTA Secundário — "Escolher outro agente"

Abre a command palette (⌘K) com o catálogo de agentes do projeto aberto. Ghost button.

```css
.sc-hero__cta-secondary {
  height: 44px;
  padding: 0 20px;
  background: transparent;
  color: var(--sc-text-muted);
  border: 1px solid var(--sc-surface-400);
  border-radius: 10px;
  font: var(--sc-font-regular) 14px/1 var(--sc-font-sans);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition:
    color       var(--sc-duration-fast) var(--sc-ease-standard),
    border-color var(--sc-duration-fast) var(--sc-ease-standard),
    background  var(--sc-duration-fast) var(--sc-ease-standard);
}

.sc-hero__cta-secondary:hover {
  color: var(--sc-text-primary);
  border-color: var(--sc-surface-400);
  background: var(--sc-surface-200);
}

.sc-hero__cta-secondary:focus-visible {
  outline: 2px solid var(--sc-surface-400);
  outline-offset: 3px;
}
```

**Ícone:** `⌘` à direita (renderizado como `<kbd>⌘K</kbd>` para semântica).

### 5.3 Layout dos CTAs

```css
.sc-hero__cta-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}
```

Os dois CTAs ficam lado a lado em desktop. Em mobile (≤ 480px) ficam em coluna (ver §7).

---

## 6. Animação de Saída

Quando o primeiro card é adicionado ao canvas (`nodes.length` passa de 0 para 1):

1. `nodes.length === 1` → `showHero` torna-se `false`
2. Hero recebe classe `.sc-hero--exiting` → `opacity: 0` em 400ms (`--sc-duration-slow`)
3. Após 400ms → componente é unmounted (AnimatePresence ou `onTransitionEnd`)

O card recém-criado deve entrar **após** o hero começar a sair, não ao mesmo tempo — delay de 100ms no card enter:

```ts
// Na action do Zustand que cria o primeiro node:
dispatch(addNode(newNode));     // triggers hero exit immediately
// O AgentChatNode já tem sc-bubble-in animation (from padme-agent-chat-anatomy §5)
// adicionar delay de 100ms na primeira montagem quando hero está a sair
```

```css
.sc-node--first-entry {
  animation-delay: 100ms;
}
```

**Sensação:** o universo "dá espaço" para o primeiro agente aparecer — o hero recua, o card avança.

---

## 7. Responsividade (até 768px)

### 7.1 Breakpoints

| Breakpoint | Comportamento |
|---|---|
| `> 768px` | Layout padrão (holograma 180×220, título 24px, CTAs em row) |
| `≤ 768px` | Holograma 140×170, título 20px, CTAs em coluna |
| `≤ 480px` | Holograma 100×120, título 18px, hint oculto (economiza espaço) |

### 7.2 CSS

```css
@media (max-width: 768px) {
  .sc-hero__hologram {
    width: 140px;
    height: 170px;
    margin-bottom: 24px;
  }

  .sc-hero__title {
    font-size: 20px;
  }

  .sc-hero__subtitle {
    font-size: 14px;
    margin-bottom: 24px;
  }

  .sc-hero__cta-group {
    flex-direction: column;
    width: 100%;
    max-width: 280px;
  }

  .sc-hero__cta-primary,
  .sc-hero__cta-secondary {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .sc-hero__hologram {
    width: 100px;
    height: 120px;
    margin-bottom: 20px;
  }

  .sc-hero__title {
    font-size: 18px;
  }

  .sc-hero__hint {
    display: none;
  }
}
```

---

## 8. Estrutura HTML Completa (referência)

```tsx
const EmptyStateHero = () => {
  const { activeFrame } = useHologramCycle(HOLOGRAM_FRAMES, 4000);
  const { invokeChief, openCommandPalette } = useCanvasActions();

  return (
    <div
      className="sc-hero"
      role="region"
      aria-label="Canvas vazio — Sala de Comando sem agentes"
    >
      <div className="sc-hero__content">

        {/* Holograma */}
        <div
          className="sc-hero__hologram"
          aria-hidden="true"
        >
          {HOLOGRAM_FRAMES.map((frame, i) => (
            <div
              key={frame}
              className={cn(
                'sc-hero__hologram-frame',
                i === activeFrame && 'sc-hero__hologram-frame--active',
              )}
              style={{ color: `var(--sc-agent-${frame})` }}
            >
              <AgentSilhouette agent={frame} />
            </div>
          ))}
        </div>

        {/* Copy */}
        <h2 className="sc-hero__title">
          Sua Sala de Comando está vazia
        </h2>
        <p className="sc-hero__subtitle">
          Do or do not. Invoque para começar.
        </p>

        {/* CTAs */}
        <div className="sc-hero__cta-group">
          <button
            className="sc-hero__cta-primary"
            onClick={invokeChief}
            aria-label="Invocar agente Chief — Yoda, Orquestrador de Squad"
          >
            <span aria-hidden="true">✨</span>
            Invocar Chief (Yoda)
          </button>

          <button
            className="sc-hero__cta-secondary"
            onClick={openCommandPalette}
            aria-label="Abrir catálogo de agentes (⌘K)"
          >
            Escolher outro agente
            <kbd aria-hidden="true">⌘K</kbd>
          </button>
        </div>

        {/* Hint */}
        <p className="sc-hero__hint" aria-label="Atalhos de teclado disponíveis">
          <kbd>⌘K</kbd>
          <span>para buscar</span>
          <span aria-hidden="true">·</span>
          <kbd>⌘N</kbd>
          <span>para novo agente</span>
        </p>

      </div>
    </div>
  );
};
```

---

## 9. Integração com Agent Catalog (Decisão 8 do Plano Mestre)

O CTA primário sempre cria o Chief. Mas se o projeto aberto **não tiver** um agente Chief (scanner não encontrou `chief.md` ou equivalente nos `.claude/commands/`), o CTA primário deve adaptar-se ao "mais relevante disponível" (primeiro na lista do catálogo), e o texto muda:

```
"Invocar Chief (Yoda)"         → projeto com Chief
"Invocar {NomeAgente}"         → primeiro agente encontrado
"Começar com agente padrão"    → fallback builtin
```

Responsabilidade do **Agent Catalog Service** (story 9.x a definir) expor `catalogStore.primaryAgent`. Luke usa este valor para renderizar o CTA dinamicamente.

---

## 10. Tokens Novos Necessários

Adicionar em `packages/ui/tokens.css` uma secção específica para o hero:

```css
/* ============================================================
   12. EMPTY STATE HERO
   ============================================================ */
:root {
  --sc-hero-hologram-opacity:    0.20;
  --sc-hero-hologram-breathe:    1.02;   /* scale máximo */
  --sc-hero-hologram-interval:   4000ms;
  --sc-hero-title-size:          24px;
  --sc-hero-subtitle-size:       15px;
  --sc-hero-cta-height:          44px;
  --sc-hero-cta-radius:          10px;
  --sc-hero-exit-duration:       var(--sc-duration-slow); /* 400ms */
  --sc-hero-enter-duration:      300ms;
}
```

---

## 11. Checklist para Luke (story 9.8)

- [ ] `<EmptyStateHero>` renderiza quando `nodes.length === 0`
- [ ] Fade-in 300ms ao montar, fade-out 400ms ao desmontar
- [ ] Holograma cicla entre Chief / Architect / Dev-Beta a cada 4s
- [ ] Breathe animation `scale(1) → scale(1.02)` a cada 4s
- [ ] Opacity dos frames: ativo = 0.20, inativo = 0
- [ ] CTA primário "Invocar Chief (Yoda)" cria o card no centro do canvas
- [ ] CTA secundário "Escolher outro agente" abre ⌘K
- [ ] Hover no CTA primário: `translateY(-1px)` + glow verde
- [ ] Copy: "Do or do not. Invoque para começar."
- [ ] Hint `⌘K · ⌘N` com `<kbd>` semântico
- [ ] `role="region"` no hero, holograma `aria-hidden`
- [ ] `aria-label` em ambos os CTAs
- [ ] 1º card entra com delay 100ms após inicio do fade-out do hero
- [ ] Responsivo: 768px (CTAs em coluna), 480px (hint oculto, holograma menor)
- [ ] `prefers-reduced-motion`: breathe para, todos os frames a opacity 0.07
- [ ] CTA primário adapta nome se projeto não tiver Chief (via `catalogStore.primaryAgent`)
- [ ] Tokens novos adicionados em `packages/ui/tokens.css §12`

---

*— Padmé, elegance is power — e o universo merece uma entrada digna 🎨👑*
