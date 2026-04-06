import type { ChatArtifact } from './chat-types';

// ─── Claude Code Output Parser ──────────────────────────────────────────────
// Parses raw PTY output from Claude Code to extract:
//   - Assistant text (the main response shown to the user)
//   - Tool calls (Bash, Read, Edit, Write, etc.) as artifacts
//   - Filters out ANSI escape sequences, spinners, and UI chrome
//
// Claude Code output patterns (terminal):
//   - Assistant text: plain lines after prompt, before tool blocks
//   - Tool blocks: bordered boxes with headers like "⏺ Bash(command)" or "⏺ Read(file)"
//   - Thinking indicator: spinner animation
//   - Status lines: "Tokens: ...", cost info, etc.

// ─── ANSI Stripping ─────────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b\].*?\x07|\x1b[()][AB012]|\x1b\[[\?]?[0-9;]*[hlm]|\x1b\[[0-9]*[ABCDJKH]|\x1b=|\x1b>/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

// ─── Output Accumulator ─────────────────────────────────────────────────────
// Accumulates PTY output chunks and detects when a complete agent response
// has been produced (idle detection). Then parses the accumulated buffer.

export interface ParsedResponse {
  text: string;
  artifacts: ChatArtifact[];
}

// Tool block markers in Claude Code output
const TOOL_MARKER = '⏺';
const TOOL_PATTERNS: Record<string, RegExp> = {
  bash: /^⏺\s*(?:Bash|bash)\s*(?:\(([^)]*)\))?/,
  read: /^⏺\s*(?:Read|read)\s*(?:\(([^)]*)\))?/,
  write: /^⏺\s*(?:Write|write)\s*(?:\(([^)]*)\))?/,
  edit: /^⏺\s*(?:Edit|edit)\s*(?:\(([^)]*)\))?/,
  grep: /^⏺\s*(?:Grep|grep)\s*(?:\(([^)]*)\))?/,
  glob: /^⏺\s*(?:Glob|glob)\s*(?:\(([^)]*)\))?/,
  agent: /^⏺\s*(?:Agent|agent)\s*(?:\(([^)]*)\))?/,
};

// Lines to filter out (status, cost, UI chrome)
const FILTER_PATTERNS = [
  /^Tokens:\s/,
  /^Cost:\s/,
  /^\s*\d+\.\d+[kKmM]?\s*tokens/,
  /^╭─+╮/,
  /^╰─+╯/,
  /^│\s*$/,
  /^├─+┤/,
  /^\s*>\s*$/,           // Empty prompt line
  /^\s*\.\.\.\s*$/,     // Continuation dots
  /^Compacted\s/,        // Compaction notice
  /^\[.*\]\s*$/,         // Status indicators like [thinking]
];

export class ClaudeOutputParser {
  private buffer = '';
  private inToolBlock = false;
  private currentToolType = '';
  private currentToolName = '';
  private toolContent: string[] = [];
  private textLines: string[] = [];
  private artifacts: ChatArtifact[] = [];

  /** Feed a chunk of raw PTY output */
  feed(rawChunk: string): void {
    this.buffer += rawChunk;
  }

  /** Parse accumulated buffer and return the response, then reset */
  flush(): ParsedResponse | null {
    if (this.buffer.trim().length === 0) {
      return null;
    }

    const clean = stripAnsi(this.buffer);
    this.buffer = '';
    this.inToolBlock = false;
    this.currentToolType = '';
    this.currentToolName = '';
    this.toolContent = [];
    this.textLines = [];
    this.artifacts = [];

    const lines = clean.split('\n');

    for (const line of lines) {
      const trimmed = line.trimEnd();
      this.processLine(trimmed);
    }

    // Finalize any pending tool block
    this.finalizeToolBlock();

    // Join text lines and clean up
    const text = this.textLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')  // Collapse multiple blank lines
      .trim();

    if (text.length === 0 && this.artifacts.length === 0) {
      return null;
    }

    return {
      text,
      artifacts: this.artifacts,
    };
  }

  /** Reset without producing output */
  reset(): void {
    this.buffer = '';
    this.inToolBlock = false;
    this.currentToolType = '';
    this.currentToolName = '';
    this.toolContent = [];
    this.textLines = [];
    this.artifacts = [];
  }

  private processLine(line: string): void {
    // Check if this line starts a tool block
    if (line.includes(TOOL_MARKER)) {
      for (const [type, pattern] of Object.entries(TOOL_PATTERNS)) {
        const match = line.match(pattern);
        if (match) {
          // Finalize previous tool block if any
          this.finalizeToolBlock();

          this.inToolBlock = true;
          this.currentToolType = type;
          this.currentToolName = match[1]?.trim() ?? '';
          this.toolContent = [];
          return;
        }
      }
    }

    // If we're inside a tool block, accumulate content
    if (this.inToolBlock) {
      // Tool blocks end when we hit an empty line followed by non-indented text,
      // or when we hit another tool marker, or a horizontal rule
      if (line.trim() === '' && this.toolContent.length > 0) {
        // Could be end of tool block — peek ahead behavior not possible in streaming,
        // so we'll finalize on next non-tool, non-empty line
        this.toolContent.push('');
        return;
      }

      // Check if this starts a new tool block (handled above via TOOL_MARKER check)
      // If it's a regular line inside tool block, accumulate
      this.toolContent.push(line);
      return;
    }

    // Filter out UI chrome / status lines
    for (const pattern of FILTER_PATTERNS) {
      if (pattern.test(line)) return;
    }

    // Skip box-drawing characters (tool output borders)
    if (/^[│┃┆┊╎]/.test(line.trim())) return;
    if (/^[─━═┄┈╌]+$/.test(line.trim())) return;

    // This is assistant text
    this.textLines.push(line);
  }

  private finalizeToolBlock(): void {
    if (!this.inToolBlock) return;

    const content = this.toolContent
      .join('\n')
      .replace(/\n+$/, '')
      .trim();

    if (this.currentToolType === 'bash') {
      this.artifacts.push({
        type: 'command',
        name: this.currentToolName || 'bash',
        content: content || undefined,
      });
    } else if (['read', 'write', 'edit'].includes(this.currentToolType)) {
      this.artifacts.push({
        type: 'file',
        name: this.currentToolName || this.currentToolType,
        content: content || undefined,
      });
    } else if (['grep', 'glob', 'agent'].includes(this.currentToolType)) {
      this.artifacts.push({
        type: 'code',
        name: this.currentToolName || this.currentToolType,
        content: content || undefined,
      });
    }

    this.inToolBlock = false;
    this.currentToolType = '';
    this.currentToolName = '';
    this.toolContent = [];
  }
}
