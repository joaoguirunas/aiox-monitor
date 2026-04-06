# Chat Mode — Plano de Implementação Completo

> Interface de orquestração tipo WhatsApp/Slack para a Sala de Comando do aiox-monitor.
> Autor: Draupadi (UX Alpha) | Data: 2026-04-05

---

## 1. Visão Geral

### O que é

Uma **segunda view completa** da Sala de Comando — em vez de grids de terminais, o usuário vê uma interface de mensageiro com sidebar de agentes, conversas entre Chief e agentes, e comunicação inter-agentes via `@menções`.

### O que NÃO é

- NÃO substitui os terminais — o PTY continua rodando por baixo
- NÃO é um chat genérico — é orquestração visual de agentes reais
- NÃO requer backend novo — evolui a infraestrutura existente

### Infraestrutura existente (já implementada)

| Componente | Arquivo | Status |
|-----------|---------|--------|
| `ChatMessageStore` | `src/server/command-room/chat-store.ts` | In-memory, 500 msgs/terminal |
| `ChatCollector` | `src/server/command-room/chat-collector.ts` | Flush após 2.5s silence |
| `ClaudeOutputParser` | `src/server/command-room/claude-output-parser.ts` | ANSI strip + artifacts |
| `ChatView` | `src/components/command-room/ChatView.tsx` | Balões básicos |
| `viewMode` toggle | `TerminalPanel.tsx` | `'terminal' \| 'chat'` já existe |
| Chat WebSocket events | `pty-websocket-server.ts` | `chat-message` + `chat-clear` |
| Chat REST endpoint | `/api/command-room/[id]/messages` | GET mensagens por terminal |

---

## 2. Wireframes

### 2.1 Layout Principal — Modo Chat (tela inteira)

```
┌──────────────────────────────────────────────────────────────────────┐
│  AIOX Command Room    [PROJECT ▾]    [👥 Chat] [▣ Terminals]   ⚙️   │
├────────────────┬─────────────────────────────────────────────────────┤
│                │                                                     │
│  SIDEBAR       │  ÁREA DE CONVERSA                                   │
│  (240px fixed) │                                                     │
│                │  ┌─ Header da conversa ──────────────────────────┐  │
│  ┌──────────┐  │  │  🦁 Arjuna (Dev Alpha)  ● Ativo    [▣ PTY]  │  │
│  │ 🕉️ CHIEF │  │  └─────────────────────────────────────────────┘  │
│  │ ● Online │  │                                                     │
│  │ 3 agentes│  │  ┌─ Krishna ────────────────────────┐               │
│  └──────────┘  │  │ Implemente o LoginForm com       │  14:32        │
│                │  │ validação via zod. Siga o         │               │
│  ── Agentes ── │  │ design system existente.          │               │
│                │  │                                   │               │
│  🦁 Arjuna    │  └───────────────────────────────────┘               │
│  ● Trabalhando │                                                     │
│  "Implementa.."│          ┌─ Arjuna ─────────────────────────────┐   │
│                │          │ Criando componente. Arquivos:         │   │
│  🛡️ Bhima     │          │                                       │   │
│  ○ Idle       │          │ ┌ Artifacts ─────────────────────┐    │   │
│                │          │ │ 📝 src/components/LoginForm.tsx│    │   │
│  🏹 Nakula    │          │ │ 📝 src/lib/auth-schema.ts     │    │   │
│  ○ Idle       │          │ │ ✅ npm run lint — passed       │    │   │
│                │          │ └────────────────────────────────┘    │   │
│  🎯 Sahadeva  │          │                              14:33    │   │
│  ● Erro       │          └───────────────────────────────────────┘   │
│                │                                                     │
│  👁️ Draupadi  │  ┌─ Krishna ────────────────────────┐               │
│  ○ Offline    │  │ Agora adicione testes.            │  14:35        │
│                │  └───────────────────────────────────┘               │
│                │                                                     │
│  ── Grupos ──  │          ┌─ Arjuna ─────────────────────────────┐   │
│                │          │ ⏳ Executando...                      │   │
│  📢 Broadcast │          │ ░░░░░░░░░░░░░░░░                     │   │
│  (todos)      │          └───────────────────────────────────────┘   │
│                │                                                     │
│                ├─────────────────────────────────────────────────────┤
│                │  💬 Mensagem para Arjuna...     [@] [/] [Enter ↵]  │
│                │  ─── ou ─── @bhima faça o review                    │
└────────────────┴─────────────────────────────────────────────────────┘
```

### 2.2 Sidebar — Detalhes

```
┌────────────────┐
│  🔍 Buscar...  │   ← Filtro rápido por nome
├────────────────┤
│                │
│  ┌──────────┐  │   ← CHIEF sempre primeiro, card maior
│  │ 🕉️ CHIEF │  │      Fundo: rgba(255,68,0,0.08)
│  │ Krishna   │  │      Borda esquerda: #FF4400
│  │ ● Online  │  │
│  │ 3 linked  │  │   ← Mostra quantos agentes estão linkados
│  └──────────┘  │
│                │
│  ─ Ativos ──── │   ← Seção: agentes com status != closed
│                │
│  ┌────────────┐│
│  │🦁 Arjuna  ││   ← Compact: avatar + nome + status dot
│  │  ● Working ││      Truncate preview da última msg
│  │  "Criando.."│
│  └────────────┘│
│  ┌────────────┐│
│  │🛡️ Bhima   ││
│  │  ○ Idle    ││
│  │  "Pronto"  ││
│  └────────────┘│
│                │
│  ─ Offline ─── │   ← Seção: closed/crashed
│                │
│  ┌────────────┐│
│  │👁️ Draupadi││   ← Opacidade reduzida (0.5)
│  │  ✕ Closed  ││
│  └────────────┘│
│                │
│  ─ Canais ──── │   ← Canais especiais (futuro)
│                │
│  📢 Broadcast  │   ← Envia para TODOS os terminais
│  📋 Activity   │   ← Log de atividade geral (read-only)
│                │
│  [+ Agente]    │   ← Spawn novo terminal (abre picker)
└────────────────┘
```

### 2.3 Conversa — Anatomia do Balão

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ┌─ Outgoing (Chief/Remetente) ─────────────────┐   │
│  │                                               │   │
│  │  AVATAR   NOME              TIMESTAMP         │   │
│  │  (24px)   (bold, #F4F4E8)   (dim, 12px)      │   │
│  │                                               │   │
│  │  ┌─ Balão ─────────────────────────────────┐  │   │
│  │  │ Texto da mensagem em markdown render.   │  │   │
│  │  │ Suporte a **bold**, `code`, listas.     │  │   │
│  │  └─────────────────────────────────────────┘  │   │
│  │  bg: #1A1A1A  border: 1px #2D2D2D             │   │
│  │  border-radius: 12px 12px 12px 4px             │   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
│  ┌─ Incoming (Agente/Destinatário) ─────────────┐   │
│  │                                align: right   │   │
│  │         TIMESTAMP   NOME              AVATAR  │   │
│  │                     (bold, brand)     (24px)  │   │
│  │                                               │   │
│  │  ┌─ Balão ─────────────────────────────────┐  │   │
│  │  │ Resposta do agente com markdown.        │  │   │
│  │  │                                         │  │   │
│  │  │ ┌─ Artifacts (colapsável) ────────────┐ │  │   │
│  │  │ │ ▸ 📝 LoginForm.tsx  (created)       │ │  │   │
│  │  │ │ ▸ 🔧 npm run lint   (passed ✅)    │ │  │   │
│  │  │ │ ▾ 📝 auth-schema.ts (created)       │ │  │   │
│  │  │ │   ```ts                              │ │  │   │
│  │  │ │   export const schema = z.object({   │ │  │   │
│  │  │ │     email: z.string().email(),       │ │  │   │
│  │  │ │   });                                │ │  │   │
│  │  │ │   ```                                │ │  │   │
│  │  │ └──────────────────────────────────────┘ │  │   │
│  │  └─────────────────────────────────────────┘  │   │
│  │  bg: rgba(255,68,0,0.06)                       │   │
│  │  border: 1px rgba(255,68,0,0.15)               │   │
│  │  border-radius: 12px 12px 4px 12px             │   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 2.4 Input Bar — Detalhes

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  ┌─ Mention Popup (aparece ao digitar @) ─────────────────┐  │
│  │  🦁 Arjuna (Dev Alpha)    ● Ativo                      │  │
│  │  🛡️ Bhima (Dev Beta)      ○ Idle                       │  │
│  │  🏹 Nakula (QA Alpha)     ○ Idle                       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Command Popup (aparece ao digitar /) ─────────────────┐  │
│  │  /clear    — Limpar conversa                            │  │
│  │  /compact  — Compactar contexto do agente               │  │
│  │  /help     — Mostrar ajuda                              │  │
│  │  /status   — Status de todos os agentes                 │  │
│  │  /spawn    — Criar novo agente                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 💬 Mensagem para Arjuna...                       ↵     │  │
│  └────────────────────────────────────────────────────────┘  │
│   [@]  [/]  [📎]                              [Shift+Enter]  │
│   mention  cmd  attach                         nova linha     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.5 Toggle Global — Chat vs Terminals

```
┌──────────────────────────────────────────────────────────────┐
│  AIOX Command Room    [Projeto ▾]                            │
│                                                              │
│                              ┌───────────────────────┐       │
│                              │ [👥 Chat] [▣ Terminais] │       │
│                              └───────────────────────┘       │
│                                    ▲                         │
│                           Segmented control                  │
│                           Nível de PÁGINA, não de terminal   │
│                                                              │
│  Atalho: Cmd+Shift+C (toggle)                                │
│  Estado persiste em localStorage                             │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Arquitetura de Componentes

### 3.1 Árvore de componentes (novo)

```
CommandRoomPage (page.tsx) — evolui
├── ViewModeSwitch            — NOVO: toggle Chat/Terminals (nível de página)
│
├── [mode=terminals] TerminalGrid (atual)
│   ├── CategoryRow[]
│   └── TerminalPanel[]
│
└── [mode=chat] ChatOrchestrator           — NOVO: container principal do modo chat
    ├── AgentSidebar                       — NOVO: lista lateral de agentes
    │   ├── ChiefCard                      — NOVO: card destacado do Chief
    │   ├── AgentListItem[]                — NOVO: item de agente compacto
    │   ├── ChannelListItem[]              — NOVO: Broadcast, Activity
    │   └── SpawnAgentButton               — NOVO: botão de criar agente
    │
    ├── ConversationPanel                  — NOVO: área central de conversa
    │   ├── ConversationHeader             — NOVO: info do agente + link para PTY
    │   ├── MessageList                    — EVOLUI de ChatView.tsx
    │   │   ├── ChatBubble[]              — EVOLUI: outgoing/incoming com markdown
    │   │   │   └── ArtifactBlock[]       — EVOLUI: colapsável, syntax highlight
    │   │   ├── SystemMessage[]           — NOVO: "[Arjuna entrou]", "[Erro]"
    │   │   └── StreamingIndicator        — NOVO: "Arjuna está digitando..."
    │   └── MessageInput                   — NOVO: input com @mentions e /commands
    │       ├── MentionPopup              — NOVO: autocomplete de agentes
    │       └── CommandPopup              — NOVO: autocomplete de comandos
    │
    └── QuickTerminalDrawer                — NOVO: drawer lateral com PTY do agente
```

### 3.2 Arquivos a criar/modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/command-room/chat/ChatOrchestrator.tsx` | CRIAR | Container principal, gerencia conversa ativa |
| `src/components/command-room/chat/AgentSidebar.tsx` | CRIAR | Lista de agentes com status real-time |
| `src/components/command-room/chat/ChiefCard.tsx` | CRIAR | Card destacado do Chief |
| `src/components/command-room/chat/AgentListItem.tsx` | CRIAR | Item compacto da sidebar |
| `src/components/command-room/chat/ConversationPanel.tsx` | CRIAR | Área de conversa central |
| `src/components/command-room/chat/ConversationHeader.tsx` | CRIAR | Header com info do agente |
| `src/components/command-room/chat/MessageList.tsx` | CRIAR | Lista de mensagens com scroll |
| `src/components/command-room/chat/ChatBubble.tsx` | CRIAR | Balão individual com markdown |
| `src/components/command-room/chat/ArtifactBlock.tsx` | CRIAR | Bloco colapsável de tool/file |
| `src/components/command-room/chat/MessageInput.tsx` | CRIAR | Input com @mentions e /commands |
| `src/components/command-room/chat/MentionPopup.tsx` | CRIAR | Autocomplete de @agentes |
| `src/components/command-room/chat/CommandPopup.tsx` | CRIAR | Autocomplete de /comandos |
| `src/components/command-room/chat/StreamingIndicator.tsx` | CRIAR | "Agente está processando..." |
| `src/components/command-room/chat/SystemMessage.tsx` | CRIAR | Mensagens de sistema |
| `src/components/command-room/chat/QuickTerminalDrawer.tsx` | CRIAR | Drawer com PTY inline |
| `src/components/command-room/ViewModeSwitch.tsx` | CRIAR | Segmented control Chat/Terminals |
| `src/hooks/useChatOrchestrator.ts` | CRIAR | Hook de estado do chat mode |
| `src/hooks/useMentions.ts` | CRIAR | Hook de @mention parsing |
| `src/app/command-room/page.tsx` | MODIFICAR | Adicionar toggle e render condicional |
| `src/components/command-room/ChatView.tsx` | EVOLUIR | Extrair lógica para MessageList |
| `src/server/command-room/chat-store.ts` | EVOLUIR | Adicionar routing inter-agentes |
| `src/server/command-room/pty-websocket-server.ts` | EVOLUIR | Suporte a cross-terminal messages |
| `src/app/api/command-room/[id]/route.ts` | EVOLUIR | Suporte a @mention routing |

---

## 4. Fluxo de Dados

### 4.1 Envio de mensagem (Chief → Agente)

```
[MessageInput] → texto: "Implemente o LoginForm"
       │
       ▼
[useChatOrchestrator] → identifica agente ativo (Arjuna, terminal T1)
       │
       ▼
POST /api/command-room/T1  {data: "Implemente o LoginForm", submit: true}
       │
       ├──→ ProcessManager.write(T1, data + \r)    → PTY stdin
       └──→ ChatMessageStore.add(T1, {role:'chief', content: data})
                    │
                    ▼
              WebSocket broadcast: {type: 'chat-message', message: {...}}
                    │
                    ▼
              [MessageList] → renderiza balão outgoing
```

### 4.2 Resposta do agente (Agente → Chat)

```
PTY stdout (Arjuna respondendo)
       │
       ▼
ProcessManager.onData(T1, rawOutput)
       │
       ├──→ WebSocket binary frame → xterm.js (terminal mode, sempre)
       │
       └──→ ChatCollector.feed(T1, rawOutput)
                    │
                    ▼  (após 2.5s de silêncio)
              ClaudeOutputParser.parse(accumulated)
                    │
                    ▼
              ChatMessageStore.add(T1, {
                role: 'agent',
                content: cleanText,
                artifacts: [{type:'file', name:'LoginForm.tsx'}, ...]
              })
                    │
                    ▼
              WebSocket: {type: 'chat-message', message: {...}}
                    │
                    ▼
              [MessageList] → renderiza balão incoming com artifacts
```

### 4.3 Cross-agent mention (@bhima faz o review)

```
[MessageInput] → texto: "@bhima faça o review do LoginForm"
       │
       ▼
[useMentions] → detecta @bhima → resolve terminal T2
       │
       ▼
[useChatOrchestrator]
       │
       ├──→ POST /api/command-room/T2  {data: "faça o review do LoginForm", submit: true}
       │         ├──→ PTY stdin de Bhima
       │         └──→ ChatMessageStore.add(T2, {role:'chief', content: ...})
       │
       └──→ ChatMessageStore.add(T1, {
              role: 'system',
              content: "Mensagem encaminhada para @bhima"
            })
       │
       ▼
UI: sidebar pisca Bhima como "Trabalhando", conversa mostra system message
```

### 4.4 Broadcast (mensagem para todos)

```
[Sidebar] → clica em "📢 Broadcast"
       │
       ▼
[MessageInput] → texto: "Parem tudo e façam git stash"
       │
       ▼
[useChatOrchestrator] → itera todos terminais ativos [T1, T2, T3, ...]
       │
       ▼
Promise.all([
  POST /api/command-room/T1  {data: "...", submit: true},
  POST /api/command-room/T2  {data: "...", submit: true},
  POST /api/command-room/T3  {data: "...", submit: true},
])
       │
       ▼
Cada terminal recebe no stdin, ChatMessageStore registra em cada um
```

---

## 5. APIs — Mudanças Necessárias

### 5.1 Endpoints existentes (sem mudança)

| Endpoint | Uso no Chat Mode |
|----------|-----------------|
| `GET /api/command-room/list` | Popular sidebar com terminais/agentes |
| `POST /api/command-room/[id]` | Enviar mensagem para terminal |
| `GET /api/command-room/[id]/messages` | Carregar histórico de mensagens |
| `POST /api/command-room/spawn` | Criar novo agente via sidebar |
| `DELETE /api/command-room/[id]` | Fechar agente via sidebar |
| `WebSocket /pty?id=X` | Receber chat-message events |

### 5.2 Endpoints novos

#### `POST /api/command-room/broadcast`

Envia mensagem para múltiplos terminais de uma vez.

```typescript
// Request
{
  terminalIds: string[];   // lista de IDs destino
  data: string;            // mensagem
  submit?: boolean;        // auto-submit (default: true)
}

// Response
{
  sent: string[];          // IDs que receberam
  failed: string[];        // IDs que falharam (closed, etc)
}
```

#### `POST /api/command-room/[id]/mention`

Encaminha mensagem de um terminal para outro via @mention.

```typescript
// Request
{
  fromTerminalId: string;   // quem está mandando
  data: string;             // mensagem (sem o @prefixo)
  submit?: boolean;
}

// Response
{
  delivered: boolean;
  messageId: string;
}
```

#### `GET /api/command-room/agents/status`

Status consolidado de todos os agentes (para sidebar real-time).

```typescript
// Response
{
  agents: Array<{
    terminalId: string;
    agentName: string;
    displayName: string;
    status: 'active' | 'idle' | 'error' | 'closed';
    isChief: boolean;
    lastMessage?: string;      // preview da última mensagem
    lastMessageAt?: string;    // timestamp
    unreadCount: number;       // mensagens não lidas
  }>
}
```

### 5.3 WebSocket — Eventos novos

```typescript
// Novos tipos de mensagem no WebSocket

// Servidor → Cliente: status consolidado (a cada 5s ou on-change)
{
  type: 'agents-status',
  agents: AgentStatus[]
}

// Servidor → Cliente: mensagem cross-terminal recebida
{
  type: 'cross-message',
  fromTerminalId: string,
  fromAgentName: string,
  content: string,
  timestamp: string
}

// Servidor → Cliente: typing indicator
{
  type: 'agent-typing',
  terminalId: string,
  isTyping: boolean        // true quando PTY emitindo output
}
```

---

## 6. Estado do Cliente

### 6.1 Hook `useChatOrchestrator`

```typescript
interface ChatOrchestratorState {
  // View
  viewMode: 'chat' | 'terminals';
  activeConversation: string | null;    // terminalId selecionado na sidebar
  
  // Agentes
  agents: AgentInfo[];                  // lista de agentes com status
  
  // Mensagens (por terminal)
  messages: Map<string, ChatMessage[]>; // terminalId → mensagens
  
  // UI state
  sidebarCollapsed: boolean;
  drawerTerminalId: string | null;      // PTY drawer aberto
  unreadCounts: Map<string, number>;    // terminalId → não lidas
}

interface AgentInfo {
  terminalId: string;
  agentName: string;
  displayName: string;
  avatar: AvatarId;
  status: 'active' | 'idle' | 'error' | 'closed';
  isChief: boolean;
  categoryId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
}
```

### 6.2 Persistência local

```typescript
// localStorage keys
'aiox-chat-view-mode'        // 'chat' | 'terminals'
'aiox-chat-sidebar-collapsed' // boolean
'aiox-chat-last-conversation'  // terminalId (restaurar ao reabrir)
```

---

## 7. Comandos do Chat

### 7.1 Comandos / (slash)

| Comando | Ação | Escopo |
|---------|------|--------|
| `/clear` | Limpa mensagens da conversa atual | Local (client) |
| `/compact` | Envia `/compact` ao terminal do agente | Terminal ativo |
| `/help` | Mostra comandos disponíveis | Local |
| `/status` | Mostra status de todos os agentes | Local |
| `/spawn <agent>` | Cria novo terminal com agente | Cria terminal |
| `/kill` | Encerra terminal do agente ativo | Terminal ativo |
| `/broadcast <msg>` | Envia mensagem para todos | Todos terminais |
| `/pty` | Abre drawer com terminal PTY | Local |
| `/link <agent>` | Linka agente atual ao Chief | Modifica links |

### 7.2 Menções @

| Sintaxe | Ação |
|---------|------|
| `@arjuna <msg>` | Envia `<msg>` para o terminal de Arjuna |
| `@bhima <msg>` | Envia `<msg>` para o terminal de Bhima |
| `@all <msg>` | Broadcast para todos (= `/broadcast`) |
| `@chief <msg>` | Envia para o terminal do Chief |

**Resolução de @mention:**
1. Parser extrai `@nome` do input
2. Busca em `agents[]` por `agentName` case-insensitive
3. Se encontrado → envia para aquele terminal
4. Se não encontrado → mostra erro inline "Agente @nome não encontrado"

---

## 8. Design Tokens

### 8.1 Cores (chat-specific)

```css
/* Sidebar */
--chat-sidebar-bg: #0D0D0D;
--chat-sidebar-border: #1A1A1A;
--chat-sidebar-hover: rgba(255, 68, 0, 0.06);
--chat-sidebar-active: rgba(255, 68, 0, 0.12);

/* Chief card */
--chat-chief-bg: rgba(255, 68, 0, 0.08);
--chat-chief-border: #FF4400;

/* Balões */
--chat-bubble-outgoing-bg: #1A1A1A;
--chat-bubble-outgoing-border: #2D2D2D;
--chat-bubble-incoming-bg: rgba(255, 68, 0, 0.06);
--chat-bubble-incoming-border: rgba(255, 68, 0, 0.15);
--chat-bubble-system-bg: transparent;
--chat-bubble-system-text: rgba(244, 244, 232, 0.4);

/* Artifacts */
--chat-artifact-bg: #111111;
--chat-artifact-border: #222222;
--chat-artifact-hover: #161618;

/* Input */
--chat-input-bg: #111111;
--chat-input-border: #2D2D2D;
--chat-input-focus-border: #FF4400;

/* Status dots */
--status-active: #34d399;
--status-working: #FF4400;
--status-idle: #f59e0b;
--status-error: #EF4444;
--status-closed: #3D3D3D;
```

### 8.2 Tipografia

```css
/* Mensagens */
--chat-font-message: 14px/1.5 'Inter', system-ui, sans-serif;
--chat-font-code: 13px/1.4 'Roboto Mono', 'SF Mono', monospace;
--chat-font-timestamp: 11px;
--chat-font-agent-name: 13px, font-weight: 600;

/* Sidebar */
--chat-font-sidebar-name: 13px, font-weight: 500;
--chat-font-sidebar-preview: 12px, color: rgba(244,244,232,0.5);
```

### 8.3 Dimensões

```css
--chat-sidebar-width: 240px;
--chat-sidebar-collapsed-width: 56px;
--chat-bubble-max-width: 75%;
--chat-bubble-radius: 12px;
--chat-avatar-size: 28px;
--chat-input-height: 44px;
--chat-input-max-height: 120px; /* expandível */
--chat-drawer-width: 480px;     /* PTY drawer */
```

---

## 9. Fases de Implementação

### Fase 1 — MVP: Chat View Básico (Story 1)

**Objetivo:** Ver conversas existentes em formato chat, alternar entre modos.

**Escopo:**
- [ ] `ViewModeSwitch` — toggle global Chat/Terminals na page
- [ ] `ChatOrchestrator` — container com sidebar + conversa
- [ ] `AgentSidebar` — lista de agentes baseada nos terminais existentes
- [ ] `ConversationPanel` — exibe mensagens de um terminal selecionado
- [ ] `ChatBubble` — balões outgoing/incoming (reutiliza ChatView existente)
- [ ] `MessageInput` — input básico, envia via POST /api/command-room/[id]
- [ ] Persistir viewMode em localStorage

**NÃO inclui:** @mentions, /commands, broadcast, drawer PTY, cross-agent messaging.

**Dados:** Usa `GET /api/command-room/[id]/messages` + WebSocket `chat-message` existentes.

**Estimativa de complexidade:** Média — maioria é UI nova sobre APIs existentes.

---

### Fase 2 — @Mentions e /Commands (Story 2)

**Objetivo:** Comunicação inter-agentes e comandos rápidos.

**Escopo:**
- [ ] `MentionPopup` — autocomplete ao digitar @
- [ ] `CommandPopup` — autocomplete ao digitar /
- [ ] `useMentions` hook — parsing e resolução de @agente → terminalId
- [ ] Implementar /clear, /compact, /help, /status, /pty, /kill
- [ ] `POST /api/command-room/[id]/mention` — novo endpoint
- [ ] `SystemMessage` component — mensagens de sistema no chat
- [ ] Highlight de @mentions no texto dos balões

**Dependência:** Fase 1 completa.

---

### Fase 3 — Broadcast e Status Real-time (Story 3)

**Objetivo:** Enviar mensagens para todos, status ao vivo na sidebar.

**Escopo:**
- [ ] `POST /api/command-room/broadcast` — novo endpoint
- [ ] `GET /api/command-room/agents/status` — novo endpoint
- [ ] Canal "Broadcast" na sidebar — envia para todos
- [ ] `StreamingIndicator` — "Agente processando..." com animação
- [ ] WebSocket event `agent-typing` — baseado em PTY output activity
- [ ] WebSocket event `agents-status` — push de status consolidado
- [ ] Unread count badges na sidebar
- [ ] Notificação sonora opcional quando agente responde

**Dependência:** Fase 2 completa.

---

### Fase 4 — Quick Terminal Drawer (Story 4)

**Objetivo:** Acessar PTY sem sair do modo chat.

**Escopo:**
- [ ] `QuickTerminalDrawer` — drawer lateral com xterm.js embutido
- [ ] Botão "Ver Terminal" no header da conversa
- [ ] Comando `/pty` para abrir drawer
- [ ] Drawer usa o mesmo `usePtySocket` hook (multiplexado)
- [ ] Drag para resize do drawer
- [ ] Fechar com Esc ou clicando fora

**Dependência:** Fase 1 completa (pode rodar em paralelo com Fase 2/3).

---

### Fase 5 — Activity Feed e Polish (Story 5)

**Objetivo:** Canal de atividade consolidada e refinamentos finais.

**Escopo:**
- [ ] Canal "Activity" — feed read-only de todas as ações de todos os agentes
- [ ] Filtros no Activity: por agente, por tipo (mensagem, tool, erro)
- [ ] Busca dentro de conversas (Cmd+F)
- [ ] Markdown rendering com syntax highlighting nos balões
- [ ] Keyboard navigation: ↑↓ na sidebar, Tab para input, Esc para fechar drawer
- [ ] Responsividade: sidebar colapsável em telas menores
- [ ] Animações de entrada/saída de balões (framer-motion)
- [ ] Persistência de chat em DB (migrar de in-memory para SQLite)

**Dependência:** Fases 1-4 completas.

---

## 10. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Parser de output do Claude falha em formatos inesperados | Mensagens corrompidas/missing | Fallback: mostrar raw text quando parser falha, botão "Ver terminal" |
| Muitos agentes = muitos WebSockets simultâneos | Overhead de conexão | Multiplexar: 1 WebSocket com routing por terminalId (futuro) |
| Chat in-memory perde dados no restart | Perda de histórico | Fase 5 migra para DB; até lá, scrollback do terminal serve como backup |
| @mention para agente offline/closed | Mensagem não entregue | Mostrar erro inline, sugerir `/spawn <agent>` |
| Broadcast para muitos agentes sobrecarrega | Rate limiting do Claude | Throttle: max 1 broadcast a cada 5s, queue com prioridade |
| Toggle Chat/Terminal perde scroll position | UX ruim | Manter scroll position no state, restaurar ao voltar |

---

## 11. Decisões Arquiteturais

### D1: Client-side parsing vs Server-side

**Decisão:** Manter **server-side** (ChatCollector + ClaudeOutputParser existentes).

**Motivo:** Já funciona, já filtra ANSI, já extrai artifacts. Parsing client-side duplicaria lógica e gastaria CPU do browser. O server emite `chat-message` events via WebSocket — o client só renderiza.

### D2: Um WebSocket por terminal vs WebSocket único multiplexado

**Decisão:** Manter **um WebSocket por terminal** (atual) para Fases 1-4.

**Motivo:** A infra já existe e funciona. Multiplexar requer refactor significativo do `PtyWebSocketServer`. Reavaliar na Fase 5 se performance for problema.

**Implicação:** No modo chat, o client conecta WebSocket para o terminal ativo na conversa. Ao trocar de conversa, conecta ao novo terminal (mantendo os outros em background para receber chat-messages e atualizar sidebar).

### D3: Broadcast via cliente vs via servidor

**Decisão:** **Via servidor** — novo endpoint `POST /api/command-room/broadcast`.

**Motivo:** O client não deve fazer N chamadas POST sequenciais. O servidor itera, registra no ChatMessageStore de cada terminal, e retorna consolidado.

### D4: Persistência de chat

**Decisão:** **In-memory** (Fases 1-4), **SQLite** (Fase 5).

**Motivo:** O ChatMessageStore in-memory funciona para sessões. Persistência em DB é refinamento, não bloqueio para MVP.

### D5: Reutilizar ChatView existente vs reescrever

**Decisão:** **Extrair e evoluir** — mover a lógica de rendering de `ChatView.tsx` para `MessageList.tsx` + `ChatBubble.tsx`, adicionando markdown e artifacts. O `ChatView.tsx` original no TerminalPanel passa a importar `MessageList`.

---

## 12. Dependências Externas

| Pacote | Uso | Já instalado? |
|--------|-----|--------------|
| `react-markdown` | Render markdown nos balões | Verificar |
| `rehype-highlight` | Syntax highlight em code blocks | Verificar |
| `framer-motion` | Animações de entrada/saída | Verificar |

> Minimizar dependências novas. Se `react-markdown` não estiver instalado, avaliar render manual simples para MVP (bold, code, links).

---

## 13. Resumo Executivo

```
FASE 1 (MVP)     → Ver conversas em chat, alternar modos        → ~2 stories
FASE 2 (Mentions) → @agente e /comandos                          → ~1 story
FASE 3 (Live)     → Broadcast, status real-time, typing          → ~1 story
FASE 4 (Drawer)   → Terminal PTY inline no chat                  → ~1 story
FASE 5 (Polish)   → Activity feed, busca, DB, animações          → ~2 stories
                                                          Total: ~7 stories
```

O Chat Mode é uma **camada visual** sobre a infraestrutura de terminais existente. Cada terminal PTY continua rodando normalmente. O chat apenas apresenta a comunicação de forma organizada, adicionando routing inter-agentes via @mentions e broadcast.

A base já existe: `ChatMessageStore`, `ChatCollector`, `ClaudeOutputParser`, WebSocket events. O trabalho principal é **UI** — sidebar, balões, input com mentions — e **routing** — broadcast endpoint e @mention forwarding.

---

*Documento criado por Draupadi (UX Alpha) — excelência ou fogo* 🎨🔥
