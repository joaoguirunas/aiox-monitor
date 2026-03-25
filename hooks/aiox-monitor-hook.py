#!/usr/bin/env python3
"""
aiox-monitor hook — captures Claude Code events and sends them to the local server.
Install with: npm run install-hook (from the aiox-monitor project directory)
"""

import json
import sys
import os
import urllib.request
import urllib.error

MONITOR_URL = os.environ.get("AIOX_MONITOR_URL", "http://localhost:8888/api/events")

KNOWN_AGENTS = [
    "@dev", "@qa", "@architect", "@pm", "@po", "@sm",
    "@analyst", "@devops", "@data-engineer", "@ux-design-expert", "@aiox-master",
]


def get_project_info():
    """Extract project path and name from environment."""
    project_path = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    project_name = os.path.basename(project_path.rstrip("/\\")) or "unknown"
    return {"project_path": project_path, "project_name": project_name}


def get_terminal_info():
    """Capture terminal/process identifiers."""
    info = {
        "terminal_pid": os.getppid(),  # PID of the Claude Code process (parent)
        "terminal_session_id": os.environ.get("CLAUDE_SESSION_ID"),
    }
    # Maestri sets this env var for terminals within its workspaces
    maestri_id = os.environ.get("MAESTRI_TERMINAL_ID")
    if maestri_id:
        info["maestri_terminal_id"] = maestri_id
    return info


def detect_agent(input_data):
    """Best-effort scan of payload for @agent-name patterns."""
    try:
        text = json.dumps(input_data) if not isinstance(input_data, str) else input_data
        for agent in KNOWN_AGENTS:
            if agent in text:
                return agent
    except Exception:
        pass
    return None


def _parse_tool_field(input_data, field):
    """Extract tool field — handles both object and JSON-string formats."""
    val = input_data.get(field)
    if val is None:
        return {}
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, dict):
                return parsed
        except (json.JSONDecodeError, ValueError):
            pass
        return val
    return {}


def detect_agent_reliable(hook_type, input_data):
    """Detect agent from reliable sources only (user prompt, skill/agent tool activation).
    Avoids false positives from file contents in tool outputs."""
    if not isinstance(input_data, dict):
        return detect_agent(input_data)

    if hook_type == "UserPromptSubmit":
        # User prompt is a reliable source — they type @dev, @analyst etc.
        prompt = input_data.get("prompt") or input_data.get("content") or input_data.get("message")
        if prompt:
            return detect_agent(prompt)

    if hook_type in ("PreToolUse", "PostToolUse"):
        tool = input_data.get("tool_name") or ""

        # Skill activation is reliable (e.g., /AIOX:agents:dev)
        # The input field may be a JSON string like '{"skill": "AIOX:agents:dev"}'
        if tool == "Skill":
            tool_input = _parse_tool_field(input_data, "tool_input") or _parse_tool_field(input_data, "input")
            skill_name = tool_input.get("skill") if isinstance(tool_input, dict) else str(tool_input)
            if skill_name:
                return detect_agent(str(skill_name))

        # Agent tool is reliable
        if tool == "Agent":
            tool_input = _parse_tool_field(input_data, "tool_input") or _parse_tool_field(input_data, "input")
            prompt_text = tool_input.get("prompt") if isinstance(tool_input, dict) else str(tool_input)
            if prompt_text:
                return detect_agent(str(prompt_text))

        # DON'T scan tool_response/output — file contents cause false positives

    if hook_type in ("Stop", "SubagentStop"):
        # Don't scan assistant response — contains file contents, agent refs in code
        return None

    return None


def send_event(payload):
    """POST payload to monitor server. Fails silently if server is offline."""
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            MONITOR_URL,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except (urllib.error.URLError, OSError, Exception):
        pass  # Server offline or unreachable — never block Claude Code


def _truncate(obj, max_len=500):
    """Truncate strings/objects to avoid oversized payloads."""
    if obj is None:
        return None
    try:
        s = json.dumps(obj) if not isinstance(obj, str) else obj
        return s[:max_len] if len(s) > max_len else s
    except Exception:
        return None


def _extract_tool_summary(tool_input, tool_name=None):
    """Extract human-readable text from tool_input based on tool type."""
    if tool_input is None:
        return None
    if isinstance(tool_input, str):
        return tool_input[:500]
    if isinstance(tool_input, dict):
        # Try tool-specific fields first
        if tool_name == "Bash":
            cmd = tool_input.get("command")
            if cmd:
                return cmd[:500]
        elif tool_name in ("Read", "Write", "Edit"):
            fp = tool_input.get("file_path")
            if fp:
                return fp[:500]
        elif tool_name in ("Grep", "Glob"):
            pat = tool_input.get("pattern")
            if pat:
                return pat[:500]
        elif tool_name == "WebSearch":
            q = tool_input.get("query")
            if q:
                return q[:500]
        # Generic fallback: try common field names
        for key in ("command", "query", "prompt", "file_path", "pattern", "description", "content"):
            val = tool_input.get(key)
            if val and isinstance(val, str):
                return val[:500]
    return _truncate(tool_input)


def _extract_input_summary(hook_type, input_data):
    """Extract a human-readable summary from the hook payload."""
    if hook_type == "UserPromptSubmit":
        # User prompt — the canonical field is "prompt"
        prompt = input_data.get("prompt") or input_data.get("content") or input_data.get("message")
        if prompt and isinstance(prompt, str):
            return prompt[:500]
        return None

    if hook_type in ("Stop", "SubagentStop"):
        msg = input_data.get("last_assistant_message")
        if msg and isinstance(msg, str):
            return msg[:300]
        return None

    # PreToolUse / PostToolUse — extract readable command from tool_input
    tool_name = input_data.get("tool_name")
    tool_input = input_data.get("tool_input")
    return _extract_tool_summary(tool_input, tool_name)


def main():
    """Entry point — reads stdin from Claude Code hook invocation."""
    # Read stdin (Claude Code sends the hook payload as JSON on stdin)
    input_data = {}
    try:
        raw = sys.stdin.read()
        if raw.strip():
            input_data = json.loads(raw)
    except (json.JSONDecodeError, EOFError, Exception):
        pass  # Empty or invalid stdin — proceed with empty payload

    project = get_project_info()
    terminal = get_terminal_info()

    # Hook type: try env var first, then stdin JSON field
    hook_type = os.environ.get("CLAUDE_HOOK_TYPE", "") or input_data.get("hook_event_name", "")

    # Detect agent from reliable sources only (prompt text, skill activation)
    agent_name = detect_agent_reliable(hook_type, input_data)

    payload = {
        "hook_type": hook_type,
        "project_path": project["project_path"],
        "project_name": project["project_name"],
        "agent_name": agent_name,
        "tool_name": input_data.get("tool_name") or input_data.get("tool"),
        "input": _extract_input_summary(hook_type, input_data),
        "output": _truncate(input_data.get("tool_response") or input_data.get("output")),
        "timestamp": input_data.get("timestamp"),
        "terminal_pid": terminal["terminal_pid"],
        "terminal_session_id": terminal["terminal_session_id"],
        "maestri_terminal_id": terminal.get("maestri_terminal_id"),
    }

    send_event(payload)


if __name__ == "__main__":
    main()
