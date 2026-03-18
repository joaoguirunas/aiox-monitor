/**
 * Ganga Ativo — Prompt classification engine.
 * Classifies terminal output text as safe/blocked/ambiguous for auto-response.
 */

export type PromptClassification = 'safe' | 'blocked' | 'ambiguous';

export interface ClassificationResult {
  classification: PromptClassification;
  suggestedResponse: string;
  matchedPattern: string;
}

// ── Patterns that indicate a question is waiting ──────────────────────────────

const QUESTION_INDICATORS: RegExp[] = [
  /\?\s*$/,
  /\(y\/n\)/i,
  /\(yes\/no\)/i,
  /\(s\/n\)/i,
  /\(sim\/não\)/i,
  /proceed\?/i,
  /continue\?/i,
  /confirm/i,
  /do you want to/i,
  /shall I/i,
  /would you like/i,
  /press enter|hit enter/i,
  /approve this/i,
  /accept\?/i,
  /ready to/i,
  /go ahead/i,
];

// ── SAFE: binary y/n prompts that can be auto-responded ───────────────────────

const SAFE_PATTERNS: { pattern: RegExp; response: string }[] = [
  { pattern: /\(y\/n\)/i, response: 'y' },
  { pattern: /\(yes\/no\)/i, response: 'yes' },
  { pattern: /\(s\/n\)/i, response: 's' },
  { pattern: /\(sim\/não\)/i, response: 'sim' },
  { pattern: /proceed\?/i, response: 'yes' },
  { pattern: /continue\?/i, response: 'yes' },
  { pattern: /do you want to continue/i, response: 'yes' },
  { pattern: /do you want to proceed/i, response: 'yes' },
  { pattern: /shall I continue/i, response: 'yes' },
  { pattern: /shall I proceed/i, response: 'yes' },
  { pattern: /would you like to continue/i, response: 'yes' },
  { pattern: /would you like to proceed/i, response: 'yes' },
  { pattern: /ready to proceed/i, response: 'yes' },
  { pattern: /approve this change/i, response: 'yes' },
  { pattern: /accept this/i, response: 'yes' },
  { pattern: /go ahead\?/i, response: 'yes' },
  { pattern: /apply.*changes\?/i, response: 'yes' },
  { pattern: /overwrite\?/i, response: 'yes' },
  { pattern: /create.*file\?/i, response: 'yes' },
  { pattern: /install.*dependencies\?/i, response: 'yes' },
];

// ── BLOCKED: NEVER auto-respond to these ──────────────────────────────────────

const BLOCKED_PATTERNS: RegExp[] = [
  /delete|remover|apagar|drop/i,
  /force.?push|--force/i,
  /rm\s+-rf/i,
  /reset\s+--hard/i,
  /password|senha|secret|token|credential/i,
  /push.*main|push.*master|push.*prod/i,
  /deploy|release|publish/i,
  /merge.*main|merge.*master/i,
  /payment|billing|fatura/i,
  /sudo|chmod|chown/i,
  /\.env\b/i,
  /database.*drop|truncate/i,
  /destroy|irreversible|cannot be undone/i,
  /production|staging/i,
  /rollback.*database/i,
  /remove.*all/i,
  /format.*disk|format.*drive/i,
  /kill.*process/i,
];

/**
 * Checks if text contains a pending question indicator.
 */
export function containsQuestion(text: string): boolean {
  return QUESTION_INDICATORS.some(p => p.test(text));
}

/**
 * Classify a prompt text for auto-response eligibility.
 */
export function classifyPrompt(text: string): ClassificationResult {
  // Check blocked FIRST — always takes priority
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        classification: 'blocked',
        suggestedResponse: '',
        matchedPattern: pattern.source,
      };
    }
  }

  // Check safe patterns
  for (const { pattern, response } of SAFE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        classification: 'safe',
        suggestedResponse: response,
        matchedPattern: pattern.source,
      };
    }
  }

  // If it has a question but no match → ambiguous
  if (containsQuestion(text)) {
    return {
      classification: 'ambiguous',
      suggestedResponse: '',
      matchedPattern: 'question-detected',
    };
  }

  // Not a question at all
  return {
    classification: 'ambiguous',
    suggestedResponse: '',
    matchedPattern: 'no-question',
  };
}
