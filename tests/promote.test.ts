/**
 * Unit tests — promote.ts: buildContinuationPrompt
 *
 * Testa a função de sumarização de histórico de mensagens → prompt de continuação.
 * Não toca o DB nem node-pty — tudo puro / in-memory.
 *
 * Story 9.6 / JOB-038
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildContinuationPrompt } from '../src/server/agent-bus/promote.js';

// ---------------------------------------------------------------------------
// Helper: fabrica uma mensagem falsa com defaults razoáveis
// ---------------------------------------------------------------------------

function makeMsg(
  overrides: Partial<{
    id: string;
    sender_role: string;
    content: string;
    created_at: string;
  }> = {},
) {
  return {
    id: overrides.id ?? `msg-${Math.random().toString(36).slice(2)}`,
    sender_role: overrides.sender_role ?? 'agent',
    content: overrides.content ?? 'Mensagem padrão',
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('buildContinuationPrompt', () => {

  // ── Caso vazio ──────────────────────────────────────────────────────────────

  it('sem mensagens — retorna instrução de sessão nova', () => {
    const result = buildContinuationPrompt('Dex', []);
    assert.match(result, /Você é Dex/);
    assert.match(result, /sem histórico anterior/);
  });

  // ── Inclusão de roles ───────────────────────────────────────────────────────

  it('inclui mensagens de role user, agent e chief', () => {
    const msgs = [
      makeMsg({ sender_role: 'user',   content: 'Pergunta do usuário' }),
      makeMsg({ sender_role: 'agent',  content: 'Resposta do agente' }),
      makeMsg({ sender_role: 'chief',  content: 'Instrução do chief' }),
    ];
    const result = buildContinuationPrompt('Aria', msgs);
    assert.match(result, /Pergunta do usuário/);
    assert.match(result, /Resposta do agente/);
    assert.match(result, /Instrução do chief/);
  });

  it('exclui mensagens de role system e tool', () => {
    const msgs = [
      makeMsg({ sender_role: 'system', content: 'Tool executada' }),
      makeMsg({ sender_role: 'tool',   content: 'Output da tool' }),
      makeMsg({ sender_role: 'user',   content: 'Mensagem visível' }),
    ];
    const result = buildContinuationPrompt('Dex', msgs);
    assert.doesNotMatch(result, /Tool executada/);
    assert.doesNotMatch(result, /Output da tool/);
    assert.match(result, /Mensagem visível/);
  });

  // ── Prefixos de role ────────────────────────────────────────────────────────

  it('mensagem de user tem prefixo [user]', () => {
    const msgs = [makeMsg({ sender_role: 'user', content: 'Olá' })];
    const result = buildContinuationPrompt('Dex', msgs);
    assert.match(result, /\[user\] Olá/);
  });

  it('mensagem de agent tem prefixo [agent]', () => {
    const msgs = [makeMsg({ sender_role: 'agent', content: 'Resposta' })];
    const result = buildContinuationPrompt('Dex', msgs);
    assert.match(result, /\[agent\] Resposta/);
  });

  it('mensagem de chief tem prefixo [agent] (role visível do usuário)', () => {
    const msgs = [makeMsg({ sender_role: 'chief', content: 'Ordem do chief' })];
    const result = buildContinuationPrompt('Chief', msgs);
    assert.match(result, /\[agent\] Ordem do chief/);
  });

  // ── Cabeçalho e rodapé ──────────────────────────────────────────────────────

  it('cabeçalho menciona nome do agente e contagem de mensagens', () => {
    const msgs = [makeMsg(), makeMsg()];
    const result = buildContinuationPrompt('Quinn', msgs);
    assert.match(result, /Quinn/);
    assert.match(result, /2 mensagens/);
  });

  it('rodapé é presente', () => {
    const msgs = [makeMsg()];
    const result = buildContinuationPrompt('Dex', msgs);
    assert.match(result, /Fim do contexto/);
  });

  // ── Truncamento de mensagens longas ────────────────────────────────────────

  it('trunca conteúdo maior que 200 chars com reticências', () => {
    const longContent = 'x'.repeat(300);
    const msgs = [makeMsg({ sender_role: 'agent', content: longContent })];
    const result = buildContinuationPrompt('Dex', msgs);
    // Deve aparecer truncado com …
    assert.match(result, /x{200}…/);
    // Não deve aparecer o conteúdo inteiro
    assert.doesNotMatch(result, /x{201}/);
  });

  it('não trunca mensagem com exatamente 200 chars', () => {
    const exactContent = 'a'.repeat(200);
    const msgs = [makeMsg({ sender_role: 'user', content: exactContent })];
    const result = buildContinuationPrompt('Dex', msgs);
    assert.match(result, new RegExp(`a{200}`));
    assert.doesNotMatch(result, /…/);
  });

  it('não trunca mensagem com menos de 200 chars', () => {
    const shortContent = 'Mensagem curta';
    const msgs = [makeMsg({ sender_role: 'agent', content: shortContent })];
    const result = buildContinuationPrompt('Dex', msgs);
    assert.match(result, /Mensagem curta/);
  });

  // ── Múltiplas mensagens: ordem preservada ──────────────────────────────────

  it('preserva ordem cronológica das mensagens', () => {
    const msgs = [
      makeMsg({ sender_role: 'user',  content: 'Primeira mensagem' }),
      makeMsg({ sender_role: 'agent', content: 'Segunda mensagem' }),
      makeMsg({ sender_role: 'user',  content: 'Terceira mensagem' }),
    ];
    const result = buildContinuationPrompt('Dex', msgs);
    const idx1 = result.indexOf('Primeira mensagem');
    const idx2 = result.indexOf('Segunda mensagem');
    const idx3 = result.indexOf('Terceira mensagem');
    assert.ok(idx1 < idx2, 'primeira antes de segunda');
    assert.ok(idx2 < idx3, 'segunda antes de terceira');
  });

  // ── Somente roles excluídos — sem linhas de conteúdo ──────────────────────

  it('quando só existem roles system/tool, não gera linhas de conteúdo mas gera cabeçalho vazio', () => {
    const msgs = [
      makeMsg({ sender_role: 'system', content: 'ruído' }),
      makeMsg({ sender_role: 'tool',   content: 'mais ruído' }),
    ];
    const result = buildContinuationPrompt('Dex', msgs);
    // Cabeçalho ainda existe (mensagens existem, só foram filtradas)
    assert.match(result, /=== Contexto/);
    // Nenhum conteúdo de linha
    assert.doesNotMatch(result, /ruído/);
  });
});
