# JOB-010 — Viabilidade Frontend Redesign Sala de Comando

> Autor: Luke (dev-alpha) · Squad: themaestridev
> Data: 2026-04-14
> Escopo: APENAS análise técnica, sem implementação.

Stack detectada: `@xyflow/react` v12, React 19, Next 15.1.6. Scaffold atual já renderiza `TerminalPanel` completo (xterm.js) dentro de node — prova viva de que custom nodes ricos funcionam.

---

## (1) Custom node rico com `<ChatPanel />` — VIÁVEL ✅

- **React Flow v12 renderiza qualquer JSX como node.** Você já faz isso com `TerminalPanel` (xterm + WebSocket + controles). Um `ChatPanel` é ordens de magnitude mais leve (DOM React vs canvas WebGL do xterm).
- **Performance com 10+ nodes:** tranquilo até ~20-30 nodes. Gargalos reais aparecem em 50+ ou quando a viewport re-renderiza tudo. Mitigações obrigatórias:
  - `memo()` no ChatNode (já fazem em `TerminalNode.tsx:30`).
  - Virtualizar a lista de mensagens dentro do chat (`react-virtuoso` ou `@tanstack/react-virtual`) — crítico se histórico passar de ~50 msgs/node.
  - `onlyRenderVisibleElements` no `<ReactFlow>` para cull off-screen.
  - Zoom baixo → degradar o node (LOD): em `zoom < 0.4`, trocar ChatPanel por card com 3 últimas msgs (React Flow expõe zoom via `useStore`).
- **Armadilhas (todas conhecidas, todas resolvíveis):**
  - **Pan/drag conflict:** padrão `nodrag nopan` no wrapper do conteúdo + `dragHandle` dedicado (o código atual em `TerminalNode.tsx:54-62` é exatamente isso — replicar).
  - **Seleção de texto:** React Flow intercepta mousedown → some. Solução: classe `nodrag` no container de mensagens. Selo adicional `className="nodrag nopan nowheel"` libera scroll, drag e seleção.
  - **Foco de input:** `<input>` dentro de node perde foco se o node re-renderiza com nova `data` referencial. Solução: não reconstruir o objeto `data` em cada render (usar `useMemo` por node, ou mover estado do input para Zustand/ref fora da prop `data`). O código atual em `CanvasView.tsx:100-109` **tem esse bug latente** — recria `data` a cada `terminals` change.
  - **Teclado global (Delete/Backspace):** React Flow remove node selecionado com Backspace. **Obrigatório** passar `deleteKeyCode={null}` ou filtrar quando input tem foco — senão digitar no chat apaga o node.
  - **Wheel/scroll:** `nowheel` no body da lista de msgs, senão o scroll do chat dá zoom no canvas.

**Veredito:** viável. Risco técnico BAIXO, mas os 5 pitfalls acima **precisam** estar na DoD.

---

## (2) Chat lib — **Vercel AI SDK UI (`useChat`) + shadcn chat primitives**

| Opção | Veredito |
|---|---|
| **assistant-ui** | ❌ Opinativo demais, assume threading/tools próprios, layout rígido. Acopla ao runtime deles. Ruim como child de node com tamanho constrained. |
| **Vercel AI SDK UI (`ai/react` → `useChat`)** | ✅ **Escolha.** Hook puro, headless, agnóstico de provider. Basta apontar `api: '/api/command-room/chat/[id]'` e sua rota SSE faz o routing via Maestri. Zero acoplamento com `@anthropic-ai/sdk`. |
| **shadcn chat (blocks)** | ✅ Complemento perfeito para a **UI** (bubbles, composer, auto-scroll). Copia-cola, sem dep. |

**Combinação recomendada:** `useChat` (transporte + estado) + shadcn chat blocks (apresentação). O backend continua SSE do App Router roteando via Maestri — `useChat` suporta o protocolo `data-stream` do AI SDK, mas aceita streams customizados se usar `streamProtocol: 'text'`.

**Aviso:** `useChat` v4 (AI SDK 4+) tem melhor API para provider-agnostic; evitar v2/v3 legacy.

---

## (3) Drag-and-drop toolbar → canvas

- **API:** React Flow **não tem `useOnDrop`**. Padrão canônico é HTML5 DnD nativo:
  - Toolbar: `<div draggable onDragStart={e => e.dataTransfer.setData('application/aiox-node', 'chat')}>`
  - Canvas: `<ReactFlow onDrop={handler} onDragOver={e => e.preventDefault()}>`
  - Dentro do handler: `screenToFlowPosition({ x: e.clientX, y: e.clientY })` (hook `useReactFlow()`) → criar node com essa posição.
- **Pitfall:** handler precisa ler `dataTransfer` dentro do `onDrop` síncrono (Chrome anula o DataTransfer após o evento).
- Exemplo oficial: docs React Flow → "Drag and Drop". Direto, sem libs.

**Veredito:** API nativa basta, trivial (~30 linhas).

---

## (4) Zustand + React Flow — COMPATÍVEIS ✅

- **React Flow v12 usa Zustand internamente.** Documentação oficial recomenda Zustand como store recomendado para canvas com estado rico.
- Padrão: store Zustand com `nodes`, `edges`, `onNodesChange`, `onEdgesChange`, `addNode`, e passa tudo via props — em vez de `useNodesState`/`useEdgesState`.
- **Não há conflito** com stores Zustand já existentes no projeto; rodam paralelo.
- **Migração do código atual:** hoje `CanvasView.tsx:84-85` usa hooks locais de React Flow. Para estado global (multi-view, persistir layout, slash commands globais), mover para Zustand. **Necessário antes** de introduzir ChatNode persistente + drag-drop + slash global.

**Veredito:** compatíveis. Fazer a migração no começo da pivotada, não depois.

---

## (5) Realtime SSE + Next 15 App Router

| Opção | Veredito |
|---|---|
| `useSyncExternalStore` | ✅ Primitivo correto, mas você está reimplementando o que `useChat` já faz. Usar só se SSE for fora de chat (ex: status de agentes). |
| **TanStack Query** subs | ⚠️ TanStack Query não foi feito para streams contínuos. `useQuery` + SSE é hack. Use só para snapshots/REST. |
| **SWR mutate** | ⚠️ Mesmo problema — polling-oriented. |
| **Vercel AI SDK `useChat`** | ✅ **Para chat/mensagens.** Lida com SSE, reconexão, partial messages. |
| **EventSource nativo + Zustand** | ✅ **Para telemetria não-chat** (status de node, heartbeat agentes). Um `useEffect` com `new EventSource(url)` → dispatcher no store Zustand. Scoped por node. |

**Veredito:** **duas pistas.**
- Mensagens do chat → `useChat`.
- Status/telemetria dos nodes → `EventSource` + Zustand store.
- Nada de TanStack/SWR para streams.

---

## (6) Command palette / slash — `cmdk` global + slash inline

| Opção | Veredito |
|---|---|
| **kbar** | ❌ Pouco mantido, estilo difícil de combinar com design atual. |
| **cmdk** (shadcn `<Command>`) | ✅ **Escolha.** Base do shadcn, já no design system, acessível, composável. |
| Custom | ❌ Over-engineering. |

**Arquitetura:**
- **Global (`Cmd+K`):** `cmdk` em portal no canvas — ações transversais (criar node, alternar grid/canvas, abrir projeto, disparar Maestri broadcast). Listener global.
- **Inline por node (`/` no input):** **custom leve dentro do composer do ChatNode** — slash commands são contextuais (`/ask`, `/maestri`, `/branch`). Usar `cmdk` aqui também é possível (mesma UX), mas com `filter` local e portal no próprio node (cuidado com `nodrag`/`nowheel`).

**Veredito:** `cmdk` nos dois lugares, mas escopos separados. Global = ações. Inline = commands do agente.

---

## (7) Migration path — COEXISTÊNCIA VIÁVEL ✅

- **React Flow suporta múltiplos `nodeTypes`** no mesmo canvas (`CanvasView.tsx:25` já define `NODE_TYPES`). Adicionar `chatNode: ChatNode` ao lado de `terminalNode` é one-liner.
- **Estratégia recomendada:**
  1. Criar `ChatNode` isolado (novo arquivo, nova rota SSE, novo store slice).
  2. Registrar no `NODE_TYPES` junto com `terminalNode`.
  3. Toolbar permite criar ambos durante transição.
  4. Feature flag (env ou Zustand) para esconder terminalNode quando estiver pronto.
  5. **Não migrar** terminalNode existentes automaticamente — usuário decide, ou rotas legadas permanecem via `terminalNode`.
- **Trade-offs:**
  - ✅ **Prós:** risco baixo, rollback trivial, permite A/B perceptivo, não para o uso atual.
  - ⚠️ **Contras:** dois modelos de dados (terminal PTY vs chat messages) → store precisa discriminar por `node.type`. Handlers (`onClose`, `onLink`) hoje são terminal-específicos em `CanvasView.tsx:38-42` — generalizar para não quebrar.
  - ⚠️ **Links/edges:** se ChatNode conecta a TerminalNode (chief delegando), semântica de edge precisa ser comum. Resolve com `edge.data.kind: 'delegation' | 'reference'`.

**Veredito:** coexistir. Trocar tudo de uma vez é desnecessário e arriscado.

---

## TL;DR — pilha recomendada

```
@xyflow/react (já) + Zustand global store
  ↓
ChatNode (memo) = shadcn chat blocks + AI SDK useChat
  ↓
Rota SSE /api/command-room/chat/[id] → Maestri router (sem Anthropic SDK no client)
  ↓
EventSource + Zustand para telemetria não-chat
  ↓
cmdk global (Cmd+K) + cmdk inline por node (/)
  ↓
HTML5 DnD nativo com screenToFlowPosition
  ↓
Coexistência terminalNode + chatNode via NODE_TYPES
```

**Bloqueadores:** nenhum.
**Riscos médios:** foco de input em re-render (corrigir recriação de `data`), `deleteKeyCode`, virtualização acima de 50 msgs.
**Tempo estimado de scaffolding** (calibragem de escopo): 2-3 dias até ChatNode funcional isolado, +2 dias integração SSE/Maestri, +1 dia slash/cmdk.

---

*— Luke, use the Force 💻🌟*
