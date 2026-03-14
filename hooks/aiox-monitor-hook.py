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
    return {
        "terminal_pid": os.getppid(),  # PID of the Claude Code process (parent)
        "terminal_session_id": os.environ.get("CLAUDE_SESSION_ID"),
    }


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
    hook_type = os.environ.get("CLAUDE_HOOK_TYPE", "")

    # Detect agent from explicit field or payload scan
    agent_name = detect_agent(input_data)

    payload = {
        "hook_type": hook_type,
        "project_path": project["project_path"],
        "project_name": project["project_name"],
        "agent_name": agent_name,
        "tool_name": input_data.get("tool_name") or input_data.get("tool"),
        "input": _truncate(input_data.get("tool_input", input_data)),
        "output": _truncate(input_data.get("tool_response") or input_data.get("output")),
        "timestamp": input_data.get("timestamp"),
        "terminal_pid": terminal["terminal_pid"],
        "terminal_session_id": terminal["terminal_session_id"],
    }

    send_event(payload)


if __name__ == "__main__":
    main()
