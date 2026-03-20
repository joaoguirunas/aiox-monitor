# Epic 7 — Config Module: Operational Excellence & Feature Completion

> **PM:** Morgan | **Data:** 2026-03-18
> **Análise base:** `docs/Config.md` (Atlas, Analyst Agent)
> **Projecto:** aiox-monitor | **Branch:** main

---

## Visão Estratégica

O módulo Config é o **painel de controlo central** do aiox-monitor. Hoje tem 12 features completas, mas 8 funcionalidades estão parciais ou invisíveis — sendo o caso mais crítico o Ganga Ativo, que funciona em background sem nenhuma visibilidade para o utilizador. Além disso, o pipeline de deploy (PM2) tinha overhead desnecessário que impactava a operação diária.

**Thesis:** Um sistema autônomo sem observabilidade é um risco operacional. Um deploy lento é atrito acumulado. Esta epic resolve ambos e completa os gaps funcionais que impedem o Config de ser um painel de controlo completo.

---

## Escopo

**Incluído:**
- Pipeline PM2 optimizado (restart rápido)
- Visibilidade total do Ganga Ativo (logs, stats, scope)
- Eliminação de tech debt (build warnings, dirty state)
- Persistência server-side de skins
- Exposição de todas as settings do schema na UI
- UX polish (dirty state, confirmação ao sair)

**Excluído:**
- Autenticação / multi-user (sistema local single-user)
- Config remota / cloud sync
- Novos temas ou geração de skins
- Refactor arquitetural do motor Ganga (apenas observabilidade)

---

## Critérios de Sucesso da Epic

| # | Critério | Métrica | Verificação |
|---|----------|---------|-------------|
| ES1 | Deploy cycle < 3s | `time (npm run build && pm2 restart aiox-monitor)` < 3s | Medição CLI |
| ES2 | Zero campos orphan no schema | Todos os campos de `company_config` com representação na UI | Auditoria manual |
| ES3 | Ganga completamente observável | User vê logs, stats, heartbeat e scope sem acesso à DB | Teste funcional |
| ES4 | Zero build warnings no módulo | `npm run build` sem warnings em ficheiros config/* e ganga/* | Build CI |
| ES5 | Skins persistem server-side | Clear localStorage não perde skins | Teste funcional |
| ES6 | Dirty state detectado | User informado de mudanças pendentes antes de navegar | Teste UX |

---

## Stories — Índice de Ficheiros

| Story | Ficheiro | Status | ACs | Branch |
|-------|----------|--------|-----|--------|
| 7.0 | [`7.0.story.md`](7.0.story.md) | **Done** | 6/6 | `main` |
| 7.1 | [`7.1.story.md`](7.1.story.md) | Draft | 0/6 | `feature/7.1-ganga-dashboard` |
| 7.2 | [`7.2.story.md`](7.2.story.md) | Draft | 0/10 | `feature/7.2-config-ux-polish` |
| 7.3 | [`7.3.story.md`](7.3.story.md) | Draft | 0/9 | `feature/7.3-skins-server` |
| 7.4 | [`7.4.story.md`](7.4.story.md) | Draft | 0/6 | `feature/7.4-event-retention` |
| 7.5 | [`7.5.story.md`](7.5.story.md) | Draft | 0/8 | `feature/7.5-logo-branding` |

**Total:** 6 stories, 45 acceptance criteria

---

## Waves — Ordenação por Prioridade

### Wave 0: Infraestrutura (DONE)

**7.0 — PM2 Fast Restart** | Critical | 6/6 ACs

Deploy cycle de ~6-7s reduzido para ~2.8s (-60%). PM2 executa node directamente sem intermediários. Esbuild movido para build step.

### Wave 1: Observabilidade Ganga (HIGH)

**7.1 — Ganga Dashboard** | Alta | 6 ACs | Depende: 7.0

O Ganga é a feature mais poderosa do sistema mas opera como caixa preta. Backend 100% pronto (API + WS). Só falta consumer React na Config page: scope toggle, contadores 24h, log table colapsável, heartbeat indicator em real-time.

### Wave 2: Tech Debt & UX (MEDIUM)

**7.2 — Config UX Polish** | Média | 10 ACs | Depende: 7.0

Dirty state detection, beforeunload guard, botão save visual, e eliminação de 6 build warnings (unused imports, img vs next/image). Esforço ~2h, maioria cleanup mecânico.

### Wave 3: Persistência & Completude (MEDIUM)

**7.3 — Skins Server-Persisted** | Média | 9 ACs | Depende: 7.2

Migração de localStorage → SQLite. Schema migration, API validation com pseudocódigo incluído, migração one-time automática, adaptation do BootScene. 7 ficheiros impactados.

**7.4 — Event Retention Config** | Média-Baixa | 6 ACs | Depende: 7.0

Slider para `event_retention_days` (7-365), info de contagem de eventos, botão cleanup manual. Reutiliza componente RangeField existente + novo endpoint `POST /api/cleanup`.

### Wave 4: Nice-to-Have (LOW)

**7.5 — Logo & Branding** | Baixa | 8 ACs | Depende: 7.2

Upload de logo (PNG/JPG/SVG, max 200KB), base64 no DB, display no Phaser. Inclui **decision gate**: implementar ou remover dead code `logo_path`.

---

## Resumo de Waves

| Wave | Stories | Prioridade | Estado | Resultado |
|------|---------|-----------|--------|-----------|
| **0** | 7.0 | Critical | **DONE** | Deploy -60% mais rápido |
| **1** | 7.1 | Alta | Pendente | Ganga observável |
| **2** | 7.2 | Média | Pendente | Zero tech debt, UX seguro |
| **3** | 7.3, 7.4 | Média | Pendente | Persistência completa |
| **4** | 7.5 | Baixa | Pendente | Branding (optional) |

---

## Riscos da Epic

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| R1 | Ganga dashboard sobrecarrega Config page | Média | UX degradada | Logs carregam lazy, secção colapsável |
| R2 | Schema migration quebra startup | Baixa | Downtime | Migration defensiva com IF NOT EXISTS |
| R3 | Falso positivo no Ganga scope "safe-and-ambiguous" | Média | Auto-resposta indesejada | Story 7.1 dá visibilidade para detectar; botão de pause rápido |
| R4 | Skin migration perde dados | Baixa | UX ruim | Migração é additive (localStorage permanece como fallback até confirmar DB) |

---

## Dependências entre Stories

```
7.0 (DONE) ─── 7.1 (Ganga Dashboard)
     │
     ├──── 7.2 (UX Polish) ─── 7.3 (Skins DB)
     │                    └─── 7.5 (Logo) [optional]
     │
     └──── 7.4 (Event Retention)
```

**Caminho crítico:** 7.0 → 7.1 → 7.2 → 7.3

---

## Delegação de Agentes

| Story | Executor | Reviewer | Notas |
|-------|----------|----------|-------|
| 7.0 | @analyst + @dev | — | DONE (implementado na sessão actual) |
| 7.1 | @dev | @qa | Frontend + WS consumer; backend já pronto |
| 7.2 | @dev | @qa | Cleanup mecânico, baixo risco |
| 7.3 | @dev | @qa | Schema migration + API + frontend |
| 7.4 | @dev | @qa | Frontend + API validation |
| 7.5 | @dev + @architect | @qa | Decisão técnica de storage + Phaser integration |

---

## Referências

- **Análise completa:** `docs/Config.md` (Atlas, @analyst)
- **Contexto do projecto:** `docs/context.md`
- **Módulo Empresa:** `docs/empresa-module.md`
- **Story anterior:** `docs/stories/6.1.story.md` (JSONL Intelligence)

---

*— Morgan, planejando o futuro 📊*
