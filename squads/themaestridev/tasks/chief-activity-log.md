---
task: Activity Log Management
responsavel: "@chief"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada:
  - campo: activity_type
    tipo: string
    origem: User Input
    obrigatorio: true
    validacao: "batch | page | feature | campaign | sprint"
  - campo: description
    tipo: string
    origem: User Input
    obrigatorio: true
  - campo: date
    tipo: string
    origem: System
    validacao: "YYYY-MM-DD"

Saida:
  - campo: log_file
    tipo: string
    destino: logs/
    persistido: true

Checklist:
  - "[ ] Criar arquivo de log"
  - "[ ] Preencher briefing inicial"
  - "[ ] Criar checklist por agente envolvido"
  - "[ ] Atualizar a cada maestri check"
  - "[ ] Registrar decisões"
  - "[ ] Registrar arquivos produzidos"
  - "[ ] Marcar status final ao concluir"
---

# *activity-log

Registra e acompanha toda atividade significativa da squad.
O Chief é o DONO do log — cria, atualiza e fecha.

## Quando Criar

- Ao receber briefing que envolve 2+ agentes
- Ao iniciar campanha, batch, sprint, página ou feature
- Ao receber demanda do usuário que gera múltiplas entregas

## Comandos

| Comando | Uso |
|---------|-----|
| `*activity-log {tipo} {descrição}` | Criar novo log |
| `*log-status` | Ver todos os logs ativos |
| `*close-log {referência}` | Fechar log concluído |

## Template do Log

O arquivo de log DEVE seguir esta estrutura:

```markdown
# Activity: {descrição curta}

**Data:** YYYY-MM-DD
**Tipo:** batch | page | feature | campaign | sprint
**Status:** 🔄 Em Progresso | ✅ Concluído | ⏸️ Pausado | ❌ Cancelado
**Solicitado por:** {usuário ou contexto}

## Briefing
- **Objetivo:** {o que foi pedido}
- **Entregas esperadas:** {lista de deliverables}
- **Prazo:** {se informado}
- **Observações:** {contexto adicional}

## Checklist por Agente

### {Agent Name} — {role}
- [ ] {entrega 1}
- [ ] {entrega 2}
- **Notas:** {observações do maestri check}

### {Agent Name} — {role}
- [ ] {entrega 1}
- **Notas:**

## Validação — {Validator Name}
- **Verdict:** ✅ APROVADO | ⚠️ AJUSTES | ❌ REFAZER
- **Feedback:** {detalhes}

## Decisões
- {YYYY-MM-DD}: {decisão tomada} — Razão: {por quê}

## Arquivos Produzidos
- `path/to/file` — {descrição}

## Resultado Final
- **Entregue em:** {data}
- **Métricas:** {se aplicável}
- **Learnings:** {o que aprendemos}
```

## Workflow de Execução

1. Chief recebe briefing → `*activity-log {tipo} "{descrição}"`
2. Chief cria pasta de trabalho + arquivo de log
3. Chief despacha agentes via maestri ask
4. A cada maestri check, Chief atualiza o checkbox correspondente no log
5. Quando Validator dá feedback, Chief registra verdict no log
6. Quando decisões são tomadas, Chief registra na seção Decisões
7. Quando atividade completa → `*close-log` com resultado final e learnings

## Localização

- **Pasta:** `logs/`
- **Naming:** `YYYY_MM_DD_feature_descricao.md`

---

*Task created by squad-creator*
