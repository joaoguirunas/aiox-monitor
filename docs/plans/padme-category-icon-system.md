# Sistema de Ícones e Cores por Categoria — ⌘K Palette

**Autor:** Padmé (UX-Alpha — UI Design Specialist)
**Data:** 2026-04-14
**Epic:** 9 — Sala de Comando v2
**JOB:** JOB-042
**Handoff para:** Luke (Dev-Alpha) — JOB-037 / story 9.x (CommandPaletteGlobal)
**Tokens:** `packages/ui/categories.css` (novo, complementa `packages/ui/tokens.css`)
**Depende de:** `docs/plans/padme-ui.md §4` (paleta por agente), `docs/plans/rey-slash-commands-spec.md §Grupo B`

> **Escopo:** Define as 8 categorias canônicas, o mapeamento `agent_id → categoria` para todos os
> agentes conhecidos (themaestridev + AIOX), os tokens CSS por categoria, o fallback para agentes
> desconhecidos e as regras de exibição na paleta ⌘K. Dark + light theme incluídos.

---

## 1. Categorias Canônicas

Oito categorias mais o fallback. A ordem abaixo é a **ordem canônica de exibição** na paleta ⌘K —
imutável, não alfabética, não por número de agentes.

| # | Slug | Nome de Display | Ícone | Cor (dark) | Hex |
|---|---|---|---|---|---|
| 1 | `orquestracao` | Orquestração | 🧘 | verde-sábio | `#84CC16` |
| 2 | `planejamento` | Planejamento | 📋 | azul-estratégia | `#38BDF8` |
| 3 | `execucao` | Execução | 💻 | dourado-trigo | `#FACC15` |
| 4 | `design` | Design | 🎨 | rosa-criativo | `#E879F9` |
| 5 | `dados` | Dados | 🗄️ | ciano-estrutura | `#22D3EE` |
| 6 | `qualidade` | Qualidade | 🧪 | roxo-profundo | `#8B5CF6` |
| 7 | `ops` | Ops | 🚀 | laranja-infra | `#F97316` |
| 8 | `pesquisa` | Pesquisa | 🔍 | cinza-claro | `#94A3B8` |
| — | `outros` | Outros | ❓ | cinza-neutro | `#6B7280` |

### 1.1 Princípios de Categorização

1. **Orquestração** é sempre única e sempre vem primeiro — o Chief (Yoda) ou equivalente de qualquer squad. Só agentes que têm autoridade de orquestrar outros pertencem aqui.
2. **Planejamento** agrupa os agentes que *decidem o que fazer* antes de qualquer código existir: PM (produto), PO (prioridade), SM (processo), Architect (forma técnica). Todos planejam o campo antes de entrar nele.
3. **Execução** é para agentes que *produzem artefatos diretamente*: código, commits, PRs. Dev em todas as variantes.
4. **Design** é exclusivamente para agentes focados em UX, UI, ou pesquisa de experiência do utilizador. Não inclui architect (vai em Planejamento).
5. **Dados** cobre modelagem, DDL, queries, migrations, RLS — tudo que é persistência estruturada.
6. **Qualidade** cobre revisão de código, testes, validação de AC, gate decisions.
7. **Ops** cobre CI/CD, git push, PR creation, infra, releases, docker.
8. **Pesquisa** cobre discovery, análise de mercado, relatórios, competitive intelligence.
9. **Outros** é o fallback dinâmico — agentes descobertos pelo scanner que não se encaixam nos 8 anteriores.

---

## 2. Mapeamento Agent ID → Categoria

### 2.1 Squad `themaestridev`

| `agent_id` | Personagem | Categoria | Justificativa |
|---|---|---|---|
| `chief` | Yoda | `orquestracao` | Orquestrador de squad, autoridade máxima de routing |
| `architect` | Obi-Wan | `planejamento` | Decide a forma técnica antes da implementação |
| `pm` | Morgan | `planejamento` | Product Management, requirements, spec pipeline |
| `po` | Pax | `planejamento` | Product Owner, backlog, story validation |
| `sm` | River | `planejamento` | Scrum Master, processo, cerimônias |
| `dev-alpha` | Luke | `execucao` | Dev principal, código e commits |
| `dev-beta` | Leia | `execucao` | Dev secundário, feature paralela |
| `dev-gamma` | Han Solo | `execucao` | Dev terciário, ship-it energy |
| `dev-delta` | Chewie | `execucao` | Dev quaternário |
| `ux-alpha` | Padmé | `design` | UI Design Specialist, specs visuais |
| `ux-beta` | Rey | `design` | UX Research, flows, wireframes |
| `data-engineer` | Lando | `dados` | Schema, DDL, migrations, RLS, índices |
| `qa` | Vader | `qualidade` | Quality gate, testes, AC validation |
| `devops` | R2-D2 | `ops` | git push, PR, CI/CD — autoridade exclusiva |
| `analyst` | C-3PO | `pesquisa` | Research, relatórios, competitive analysis |

### 2.2 Squad `AIOX`

| `agent_id` | Categoria | Justificativa |
|---|---|---|
| `aiox-master` | `orquestracao` | Framework governance, override authority |
| `architect` | `planejamento` | Arquitetura de sistema, technology selection |
| `pm` | `planejamento` | Epic orchestration, spec writing |
| `po` | `planejamento` | Story validation, backlog |
| `sm` | `planejamento` | Story creation, sprint process |
| `dev` | `execucao` | Implementação, code, commits |
| `ux-design-expert` | `design` | UX/UI design |
| `data-engineer` | `dados` | Schema, database design |
| `qa` | `qualidade` | QA gate, quality checks |
| `devops` | `ops` | git push, PR, CI/CD |
| `analyst` | `pesquisa` | Research, análise |
| `squad-creator` | `planejamento` | Cria squads — é ato de planejamento |

### 2.3 Squads Externos / Genéricos

Para agentes descobertos em projetos que não são themaestridev nem AIOX, o sistema aplica correspondência por **keywords no `role`** e `agent_id`:

| Pattern no `agent_id` ou `role` | Categoria inferida |
|---|---|
| `chief`, `master`, `orchestrat*`, `lead` | `orquestracao` |
| `pm`, `product`, `po`, `owner`, `sm`, `scrum`, `architect*`, `plann*` | `planejamento` |
| `dev*`, `engineer` (sem `data`), `coder`, `frontend`, `backend` | `execucao` |
| `ux`, `ui`, `design*`, `visual` | `design` |
| `data*`, `dba`, `database`, `schema` | `dados` |
| `qa`, `test*`, `quality`, `review*` | `qualidade` |
| `devops`, `ops`, `infra`, `ci*`, `cd*`, `deploy*` | `ops` |
| `analyst`, `research*`, `insight*` | `pesquisa` |
| *(sem match)* | `outros` |

**Implementação:** `agent-catalog/parser.ts` deve exportar `inferCategory(agentId, role): CategorySlug`.

---

## 3. Tokens CSS por Categoria

Arquivo completo: `packages/ui/categories.css` — importar **após** `packages/ui/tokens.css`.

### 3.1 Anatomia do token

Para cada categoria `{slug}`:

| Token | Uso |
|---|---|
| `--sc-cat-{slug}-color` | Cor do texto, ícone, border do chip |
| `--sc-cat-{slug}-bg` | Background do chip (opacity baixa) |
| `--sc-cat-{slug}-icon` | Emoji literal (uso em JSX / `content`) |
| `--sc-cat-{slug}-icon-url` | `url('data:image/svg+xml,...')` para `background-image` em CSS puro |

> **Nota sobre `--sc-cat-{slug}-icon-url`:** os ícones são emojis renderizados como SVG via
> encoding URI. Para uso em React/JSX, preferir o `--sc-cat-{slug}-icon` diretamente
> (ver §3.3 consumo). A URL é para casos onde apenas CSS está disponível (pseudo-elements,
> etc.) ou quando o projeto usa Twemoji para cross-platform consistency.

### 3.2 Valores por tema

#### Dark (default — `:root`)

| Categoria | `color` | `bg` |
|---|---|---|
| `orquestracao` | `#84CC16` | `rgba(132, 204, 22, 0.10)` |
| `planejamento` | `#38BDF8` | `rgba(56, 189, 248, 0.10)` |
| `execucao` | `#FACC15` | `rgba(250, 204, 21, 0.10)` |
| `design` | `#E879F9` | `rgba(232, 121, 249, 0.10)` |
| `dados` | `#22D3EE` | `rgba(34, 211, 238, 0.10)` |
| `qualidade` | `#8B5CF6` | `rgba(139, 92, 246, 0.10)` |
| `ops` | `#F97316` | `rgba(249, 115, 22, 0.10)` |
| `pesquisa` | `#94A3B8` | `rgba(148, 163, 184, 0.10)` |
| `outros` | `#6B7280` | `rgba(107, 114, 128, 0.08)` |

#### Light (`[data-theme="light"]`)

No light theme, as cores são escurecidas para manter contraste sobre backgrounds claros (WCAG AA 4.5:1 para texto, 3:1 para UI components).

| Categoria | `color` | `bg` |
|---|---|---|
| `orquestracao` | `#3D6400` | `rgba(132, 204, 22, 0.12)` |
| `planejamento` | `#0369A1` | `rgba(56, 189, 248, 0.12)` |
| `execucao` | `#7A5F00` | `rgba(250, 204, 21, 0.12)` |
| `design` | `#9333EA` | `rgba(232, 121, 249, 0.12)` |
| `dados` | `#0E7490` | `rgba(34, 211, 238, 0.12)` |
| `qualidade` | `#6D28D9` | `rgba(139, 92, 246, 0.12)` |
| `ops` | `#C2410C` | `rgba(249, 115, 22, 0.12)` |
| `pesquisa` | `#475569` | `rgba(148, 163, 184, 0.15)` |
| `outros` | `#4B5563` | `rgba(107, 114, 128, 0.10)` |

### 3.3 Consumo em React/TypeScript

```ts
// packages/ui/category-map.ts  (Luke cria este arquivo)
export const CATEGORY_MAP = {
  orquestracao: { label: 'Orquestração', icon: '🧘', slug: 'orquestracao' },
  planejamento: { label: 'Planejamento', icon: '📋', slug: 'planejamento' },
  execucao:     { label: 'Execução',     icon: '💻', slug: 'execucao'     },
  design:       { label: 'Design',       icon: '🎨', slug: 'design'       },
  dados:        { label: 'Dados',        icon: '🗄️', slug: 'dados'        },
  qualidade:    { label: 'Qualidade',    icon: '🧪', slug: 'qualidade'    },
  ops:          { label: 'Ops',          icon: '🚀', slug: 'ops'          },
  pesquisa:     { label: 'Pesquisa',     icon: '🔍', slug: 'pesquisa'     },
  outros:       { label: 'Outros',       icon: '❓', slug: 'outros'       },
} as const satisfies Record<string, CategoryDef>;

export type CategorySlug = keyof typeof CATEGORY_MAP;
export const CATEGORY_ORDER: CategorySlug[] = [
  'orquestracao', 'planejamento', 'execucao', 'design',
  'dados', 'qualidade', 'ops', 'pesquisa', 'outros',
];
```

```tsx
// Uso num CategoryChip
const CategoryChip = ({ slug }: { slug: CategorySlug }) => {
  const cat = CATEGORY_MAP[slug];
  return (
    <span
      className="sc-cat-chip"
      style={{
        color:      `var(--sc-cat-${slug}-color)`,
        background: `var(--sc-cat-${slug}-bg)`,
      }}
      aria-label={`Categoria: ${cat.label}`}
    >
      <span aria-hidden="true">{cat.icon}</span>
      {cat.label}
    </span>
  );
};
```

---

## 4. Fallback para Agentes Desconhecidos

Qualquer `agent_id` que não conste no mapeamento de §2 **e** não produza match nas keywords de §2.3 recebe automaticamente a categoria `outros`.

```ts
export function resolveCategory(agentId: string, role?: string): CategorySlug {
  // 1. Lookup direto no mapeamento estático
  const direct = STATIC_AGENT_MAP[agentId];
  if (direct) return direct;

  // 2. Keyword matching no agentId e role (case-insensitive)
  const haystack = `${agentId} ${role ?? ''}`.toLowerCase();
  for (const [pattern, category] of KEYWORD_RULES) {
    if (new RegExp(pattern, 'i').test(haystack)) return category;
  }

  // 3. Fallback
  return 'outros';
}
```

**Visual do fallback na palette:**
- Chip `outros` aparece **sempre no fim da lista**, após as 8 categorias canônicas.
- Se não houver nenhum agente `outros`, a seção não aparece (sem divisor vazio).
- O ícone `❓` e o cinza neutro deixam claro que é "não categorizado" — sem parecer erro.

---

## 5. Regras de Exibição na Paleta ⌘K

### 5.1 Estrutura visual da paleta

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔎 Invocar agente em  📁 projeto-X                 [⇅ trocar]  │
├─────────────────────────────────────────────────────────────────┤
│ [ Buscar agente...                                             ] │
├─────────────────────────────────────────────────────────────────┤
│  🧘  Orquestração                                               │ ← header de categoria
│      Yoda · Chief            project  /themaestridev:agents:..  │
│      AIOX Master             user     /AIOX:agents:aiox-master  │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤ ← divisor (1px dashed)
│  📋  Planejamento                                               │
│      Obi-Wan · Architect     project  /themaestridev:agents:..  │
│      Morgan · PM             project  /themaestridev:agents:..  │
│      Pax · PO                project  /themaestridev:agents:..  │
│      River · SM              project  /themaestridev:agents:..  │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│  💻  Execução                                                   │
│      Luke · Dev-Alpha        project  ...                       │
│      ···                                                         │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Regras de agrupamento

1. **Agrupe por categoria na ordem canônica** — sempre: Orquestração → Planejamento → Execução → Design → Dados → Qualidade → Ops → Pesquisa → Outros.
2. **Divisor entre categorias:** linha `1px dashed var(--sc-surface-300)`, não uma linha sólida — deixa a separação visual sem criar peso excessivo.
3. **Header de categoria:** ícone + label em `text-subtle`, `font: 500 11px` com `letter-spacing: 0.06em` (caps-lite style). Cor de fundo: `var(--sc-cat-{slug}-bg)` no próprio header a `0.5×` de opacidade (half-tint).
4. **Categoria vazia:** se nenhum agente do catálogo pertence a uma categoria, a seção **não aparece** (nem o header, nem o divisor).
5. **Busca ativa:** ao filtrar, as categorias que têm resultados permanecem com seus headers; categorias sem resultado desaparecem. A ordem canônica é mantida mesmo com poucas categorias visíveis.
6. **Scroll:** categorias com muitos agentes (> 6) colapsam após os primeiros 4, com um "Ver mais (N)" inline — sem criar sub-scroll dentro da palette.

### 5.3 Spec visual do item de agente

```css
.sc-palette-item {
  display:     grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  padding:     6px 12px;
  gap:         10px;
  border-radius: 8px;
  cursor: pointer;
  transition:  background var(--sc-duration-instant) var(--sc-ease-standard);
}

.sc-palette-item:hover,
.sc-palette-item[data-highlighted] {
  background: var(--sc-surface-200);
}

/* Coluna 1: avatar/emoji do agente */
.sc-palette-item__icon {
  width:  28px;
  height: 28px;
  border-radius: 8px;
  background: var(--sc-cat-{slug}-bg);  /* aplicado inline via style */
  display: flex; align-items: center; justify-content: center;
  font-size: 15px;
}

/* Coluna 2: nome + role */
.sc-palette-item__name {
  font: 500 13px/1.2 var(--sc-font-sans);
  color: var(--sc-text-primary);
}
.sc-palette-item__role {
  font: 400 11px/1.4 var(--sc-font-sans);
  color: var(--sc-text-muted);
}

/* Coluna 3: source badge */
.sc-palette-item__source {
  font: 400 10px/1 var(--sc-font-mono);
  color: var(--sc-text-subtle);
  border: 1px solid var(--sc-surface-400);
  border-radius: 4px;
  padding: 2px 6px;
}
```

### 5.4 Spec visual do header de categoria

```css
.sc-palette-cat-header {
  display:     flex;
  align-items: center;
  gap:         6px;
  padding:     8px 12px 4px;
  font:        500 11px/1 var(--sc-font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sc-text-subtle);         /* tom neutro — não rouba foco dos itens */
  user-select: none;
}

.sc-palette-cat-header__icon {
  font-size: 13px;
  /* cor aplicada inline: color: var(--sc-cat-{slug}-color) a 60% opacity */
  opacity: 0.6;
}

/* Linha separadora antes de cada header (exceto o primeiro) */
.sc-palette-cat-divider {
  height:     1px;
  margin:     4px 12px;
  background: var(--sc-surface-300);
  border:     none;
  /* stroke-dasharray não existe em HTML borders — usar
     background com repeating-linear-gradient: */
  background: repeating-linear-gradient(
    90deg,
    var(--sc-surface-300) 0px,
    var(--sc-surface-300) 4px,
    transparent           4px,
    transparent           8px
  );
}
```

### 5.5 Estado de busca ativa

- Busca é **fuzzy** (cmdk nativo) — combina contra `display_name`, `role`, `agent_id`, `squad`.
- Resultados são ordenados por relevância **dentro de cada categoria** — a ordem canônica de categorias permanece fixa.
- Nenhum destaque de match (highlight de substring) inicialmente — adicionar apenas se performance permitir (máx 200ms).
- Busca vazia → mostrar todos os agentes, agrupados.

### 5.6 Acessibilidade da palette

```tsx
<div
  role="listbox"
  aria-label="Selecionar agente para invocar"
  aria-orientation="vertical"
>
  {orderedCategories.map((cat) => (
    <div key={cat.slug} role="group" aria-labelledby={`cat-header-${cat.slug}`}>
      <div
        id={`cat-header-${cat.slug}`}
        role="presentation"
        aria-hidden="true"   /* header decorativo — grupo já tem label */
      >
        <span aria-hidden="true">{cat.icon}</span>
        {cat.label}
      </div>
      {catAgents.map((agent) => (
        <div
          key={agent.skill_path}
          role="option"
          aria-selected={highlighted === agent.skill_path}
          aria-label={`${agent.display_name}, ${agent.role}, categoria ${cat.label}, origem ${agent.source}`}
        >
          {/* item content */}
        </div>
      ))}
    </div>
  ))}
</div>
```

---

## 6. Dark + Light Theme

### 6.1 Estratégia de tema

O `tokens.css` existente define apenas dark (`:root` = dark). O `categories.css` segue a mesma convenção:
- `:root` = dark values
- `[data-theme="light"]` = light overrides (aplicado no `<html>` ou `<body>`)

**Integração com o switch de tema da Sala de Comando:** quando o utilizador muda o tema via UI, o `data-theme` attribute é aplicado no `document.documentElement`. Todos os tokens de categoria respondem automaticamente.

### 6.2 Tokens adicionais de surface (light)

O `categories.css` também define os overrides de surface para o light theme, pois o `tokens.css` existente não os tem:

```css
[data-theme="light"] {
  /* Surface overrides */
  --sc-surface-0:   #F8F9FB;
  --sc-surface-100: #FFFFFF;
  --sc-surface-200: #F1F3F6;
  --sc-surface-300: #E2E6EC;
  --sc-surface-400: #CDD3DC;
  --sc-text-primary: #0E1014;
  --sc-text-muted:   #4A5568;
  --sc-text-subtle:  #9BA1AD;
}
```

> **Aviso para Luke:** se um dia `tokens.css` ganhar suporte a light nativo, mover esses overrides
> para lá e remover do `categories.css`. Por ora ficam aqui para evitar circular dependency.

---

## 7. Checklist para Luke (JOB-037)

- [ ] `packages/ui/categories.css` importado em `globals.css` (após `tokens.css`)
- [ ] `packages/ui/category-map.ts` criado com `CATEGORY_MAP`, `CATEGORY_ORDER`, `CategorySlug`
- [ ] `inferCategory(agentId, role)` implementado em `agent-catalog/parser.ts`
- [ ] `CommandPaletteGlobal` agrupa agentes pela ordem canônica de §5.2
- [ ] Header de categoria com ícone + label + fundo `cat-bg` a half-tint
- [ ] Divisor dashed entre categorias (`repeating-linear-gradient`)
- [ ] Categorias vazias não renderizam (sem divisor fantasma)
- [ ] Busca ativa mantém ordem canônica de categorias
- [ ] "Ver mais (N)" quando categoria tem > 6 agentes
- [ ] `CategoryChip` consome `--sc-cat-{slug}-color` e `--sc-cat-{slug}-bg` via inline style
- [ ] `role="listbox"` + `role="group"` + `role="option"` na estrutura ARIA
- [ ] `aria-label` completo em cada item (nome + role + categoria + source)
- [ ] Tema light testado: `document.documentElement.setAttribute('data-theme','light')`
- [ ] Fallback `outros` aparece ao fim; não aparece se lista estiver vazia
- [ ] `inferCategory` tesado com agentes de squads externos (sem match → `outros`)

---

*— Padmé, elegance is power — e a ordem também é uma forma de beleza 🎨👑*
