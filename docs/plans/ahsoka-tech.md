# 🔍⚔️ Pesquisa: Redesign Sala de Comando v2

> **Nota:** React Flow **é** xyflow — mesma lib, xyflow é a org. Trato como uma só.

---

## (1) Canvas / Node Libs

### React Flow / xyflow — v12.x
- ✅ **Maduro (~24k★)**, custom nodes = qualquer React component, helper `nodrag`/`nopan`/`nowheel` resolve drag-vs-input dentro do chat
- ✅ Performance ok até centenas de nós com `onlyRenderVisibleElements` + `ReactFlowProvider`; 20 nós com chat ativo é trivial
- ⚠️ Edges ortogonais/animadas estilo n8n exigem custom edge — não vem de fábrica

### tldraw — v3.x
- ✅ **Tem starter kit oficial "Branching Chat"** (NodeShapeUtil + streaming AI) e "Workflow" — quase um clone do que você quer
- ✅ Infinite canvas premium (Whimsical-tier zoom/pan/select), bindings API para conexões
- ⚠️ Licença: watermark obrigatório sem licença comercial; descarta scaffold já feito (commit 80a0ce0)

### Rete.js v2
- ⚠️ Focado em **dataflow/visual programming** (estilo Blender/Unreal Blueprint) — exagero pra UI de chat
- ✅ Engine de execução (dataflow + control flow) embutida, útil só se quiser "rodar" o grafo
- ❌ Custom node rico em React tem mais boilerplate que React Flow

### Reaflow
- ❌ Layout-engine principalmente read-mostly (ELK por baixo), interatividade fraca
- ❌ Comunidade pequena, evolução lenta

**👉 Vencedor:** **React Flow v12** (mantém scaffold, custos zero). **tldraw** só se UX premium for requisito de negócio.

---

## (2) Chat UI Libs

### assistant-ui
- ✅ **Primitives composáveis** (Radix-style), streaming nativo, ideal pra caber dentro de node sem trazer chrome desnecessário
- ✅ Integra direto com Vercel AI SDK `useChat`
- ⚠️ Menos "templates prontos" que shadcn-chatbot-kit

### Vercel AI SDK UI (AI Elements)
- ✅ `useChat` + AI Elements = streaming + abort + history out-of-the-box
- ✅ Casa perfeitamente com Route Handlers do Next 15
- ⚠️ Componentes UI mais "starter" — você refina

### shadcn chat blocks (Blazity shadcn-chatbot-kit)
- ✅ Blocos puros shadcn/ui — máxima customização, copia-e-cola, sem dep runtime
- ⚠️ Você liga streaming/state manualmente (mas trivial com AI SDK)

### Novel
- ❌ É **editor Notion-like (Tiptap + AI autocomplete)**, NÃO é chat. Fora do escopo — mencionar só pra confirmar que não serve.

### CopilotKit (bônus)
- ❌ Heavy framework opinionado, pesa muito por node, lock-in maior

**👉 Vencedor:** **assistant-ui + Vercel AI SDK** com **shadcn blocks** pra polish visual do "balão" dentro do node.

---

## (3) Realtime

### SSE nativo Next.js 15 (Route Handler + ReadableStream)
- ✅ **Zero infra, zero servidor extra**, edge-compatível, perfeito pra streaming Maestri→cliente
- ✅ DX simples: `return new Response(stream, { headers: { 'Content-Type':'text/event-stream' }})`
- ⚠️ Unidirecional — input volta por POST normal (não é problema aqui)

### socket.io
- ⚠️ Exige **custom server.js** (perde edge/ISR), valor só se input fluir do server pro client em alta frequência
- ❌ Overhead pra single-user local

### PartyKit (Cloudflare)
- ✅ Ótimo se um dia virar multi-device, baseado em WebSocket + Durable Objects
- ❌ SaaS edge, complexidade prematura pra meta-monitor local
- ℹ️ Cloudflare adquiriu em 2024

### Liveblocks
- ❌ SaaS pago focado em multi-user collab; single-user local é desperdício total
- 💰 Free 100 MAU, depois usage-based

### Convex
- ✅ DX excepcional: TypeScript-first, queries reativas automáticas, free tier generoso
- ⚠️ É backend completo — substituir SQLite atual é overkill se Maestri já é source of truth
- 💰 Pricing por function calls + storage

**👉 Vencedor:** **SSE Route Handlers** + POST pra comandos. Maestri CLI já é "barramento" entre terminais; Next só observa/repassa.

---

## (4) State Sync Colaborativo

| Lib | Veredito |
|---|---|
| **Zustand** | ✅ **Default**. Single-user local não precisa CRDT. Multi-tab resolvido com `BroadcastChannel` (10 linhas) |
| **Yjs** | ❌ CRDT é pra multi-peer concorrente; aqui Maestri é fonte única |
| **Liveblocks Storage** | ❌ Mesmo motivo — SaaS multi-user |
| **TanStack DB v0.6** (mar/2026) | ⚠️ Interessante: SQLite-backed local, queries reativas, sync incremental opcional. Vale considerar se quiserem cache local + reatividade tipo signals, mas é substituir o que Zustand faz hoje. Adiar pra v3 |

**👉 Vencedor:** **Zustand** + `BroadcastChannel` para multi-tab. **Não precisa CRDT.**

---

## (5) Persistência de Conversas — SQLite atual serve?

- ✅ **Sim, sem dúvida.** SQLite local é exatamente o caso de uso ideal: single-machine, single-user, baixa concorrência, full-text search via FTS5 se quiser busca em conversas
- ✅ Drizzle ou better-sqlite3 dão DX moderna; reativo via SSE quando muda
- 💡 **Único upgrade útil:** schema `conversations(agent_id, started_at)` + `messages(conv_id, role, content, ts, parent_id)` permitindo árvore (branching chat estilo tldraw kit)
- ⚠️ Migrar pra Turso/libSQL só se quiser sync entre máquinas no futuro — não agora

**👉 Mantém SQLite. Adiciona índice em `parent_id` se quiser branching.**

---

## (6) Analogias — como os concorrentes resolvem

| Tool | Canvas | Padrão útil pra você |
|---|---|---|
| **n8n** | Custom (não usa lib pública), nó com I/O ports tipados | Inputs/outputs nomeados ("ask", "note") como handles do React Flow |
| **Flowise** | **React Flow** + LangChain.js | Comprova: React Flow escala pra produto real de agentes. 3 modos (Assistant/Chatflow/Agentflow) — inspiração de UX progressiva |
| **Langflow** | **React Flow** + Python backend | "Playground" lateral por componente — testar agente isolado sem rodar o grafo todo |
| **Retool Workflows** | Canvas proprietário (closed) | UX de "executar passo-a-passo" com inspeção de payload entre nós |

**Padrão dominante:** React Flow + custom nodes ricos + sidebar de inspeção. Você está alinhado.

---

## 🎯 Recomendação Final (Stack)

| Camada | Escolha | Justificativa |
|---|---|---|
| Canvas | **React Flow v12** | Mantém commit 80a0ce0; Flowise/Langflow validam em produção |
| Chat UI | **assistant-ui + Vercel AI SDK + shadcn blocks** | Primitives leves cabem em node; streaming nativo |
| Realtime | **SSE (Route Handler Next 15) + POST** | Zero infra; Maestri CLI é o barramento |
| State | **Zustand + BroadcastChannel** | Sem CRDT; multi-tab grátis |
| Persistência | **SQLite atual + schema com `parent_id`** | Já serve; pequeno upgrade habilita branching |
| Inspiração UX | **Flowise (3 modos) + Langflow (playground por nó) + tldraw branching kit** | Padrões já validados |

**Rotas alternativas se mudar requisito:**
- Quer "wow visual" Whimsical → trocar canvas pra **tldraw v3 + Branching Chat kit** (descarta scaffold)
- Quer multi-device colaborativo no futuro → trocar realtime pra **PartyKit** + state pra **Yjs**
- Quer reatividade tipo signals em todo lugar → considerar **TanStack DB v0.6** numa v3

— Ahsoka, the truth is out there 🔍⚔️
