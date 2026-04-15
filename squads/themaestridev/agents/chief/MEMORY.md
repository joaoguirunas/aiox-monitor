# chief — Memory

> Isolated memory for the chief agent in themaestridev squad.

## [2026-04-14] PREFERENCE: Workbench vs Produto — separação inegociável

**Contexto:** Em plano anterior, durante refactor/review do aiox-monitor, a squad inteira (`squads/themaestridev/` e `.claude/commands/themaestridev/`) foi apagada como se fosse código do produto. Usuário perdeu estado de runtime dos agentes. Restaurado via snapshot git `00deb77`.

**Insight:** O projeto tem DUAS camadas totalmente distintas que NUNCA podem ser misturadas em operações em lote:
- **Workbench (ferramental de desenvolvimento):** `squads/themaestridev/`, `.claude/commands/themaestridev/`, `.claude/skills/`, `docs/plans/*`. É COMO desenvolvemos — não é o que entregamos.
- **Produto (aiox-monitor):** `src/`, `packages/`, `scripts/`, `tests/`, `migrations/`, `docs/architecture/`, `docs/stories/`, `docs/prd/`. É o sistema que observa outros projetos.

**Aplicar quando:**
- Usuário pede review/refactor/limpeza do produto → escopo é EXCLUSIVAMENTE código em `src/`, `packages/`, `tests/`, `scripts/`, migrations/. Whitelist explícita, nunca wildcard que pegue raiz do repo.
- Qualquer plano de deleção/refactor em massa → checar se paths tocam `squads/`, `.claude/commands/themaestridev/`, `.claude/skills/`. Se sim, BLOQUEAR e perguntar.
- Pedido sobre a squad em si ("ajusta o chief", "edita o comando X") é a ÚNICA situação em que se pode tocar no workbench.
- "Revisar" nunca significa "deletar". "Limpar" precisa de lista de arquivos explícita.

## [2026-04-14] PATTERN: Maestri ask exige ativação explícita do agente

**Contexto:** Despachei JOB-046/047/048 com `maestri ask "Terminal Name" "*new-job ..."`. Os terminais responderam, mas sem persona ativa — apenas Claude nu processando o comando.

**Insight:** O `maestri ask` entrega o prompt ao terminal, mas NÃO ativa a skill do agente. Se a sessão do terminal não tem o agente carregado (ou saiu via `*exit`), o `*new-job` cai em Claude genérico.

**Aplicar quando:**
- SEMPRE prefixar o prompt com a ativação do agente: `@{agent-id} *comando ...` ou `/themaestridev:agents:{agent-id}\n*comando ...`
- Padrão seguro: `@dev-beta *new-job JOB-046 ...` (AIOX `@agent-name` syntax também ativa themaestridev agents)
- Validar via `maestri check` se o output abre com a greeting do personagem ("— Dex, sempre construindo" etc.) antes de considerar que a persona está carregada.
- Sem persona = sem critical rules (no push, no implement, delegation matrix), risco de violação silenciosa.
