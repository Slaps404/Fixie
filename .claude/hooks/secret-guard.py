#!/usr/bin/env python3
"""UserPromptSubmit hook: keep API keys out of Claude's context.

- A prompt made only of KEY=value lines (optionally prefixed with `secret`,
  `export`, or quoted values) is written into the repo-root .env and blocked, so the
  model never sees it.
- Any other prompt that looks like it contains a secret is blocked unsent.

Override the target file with SECRET_ENV_FILE (relative to the project root).
"""
import json
import os
import re
import sys

ASSIGN = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$")
SECRET_NAME = re.compile(r"(KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE)", re.I)
SECRET_VALUE = re.compile(
    r"sk-ant-[A-Za-z0-9_-]{20,}"
    r"|sk-(?:proj-)?[A-Za-z0-9_-]{20,}"
    r"|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}"
    r"|AIza[0-9A-Za-z_-]{35}"
    r"|xox[abprs]-[A-Za-z0-9-]{10,}"
    r"|AKIA[0-9A-Z]{16}"
    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----"
)


def block(reason: str) -> None:
    # `reason` is shown to the user only; the prompt is dropped from context.
    print(json.dumps({"decision": "block", "reason": reason}))
    sys.exit(0)


def upsert_env(path: str, pairs: dict) -> None:
    lines = []
    if os.path.exists(path):
        with open(path) as f:
            lines = f.read().splitlines()
    remaining = dict(pairs)
    for i, line in enumerate(lines):
        m = ASSIGN.match(line)
        if m and m.group(1) in remaining:
            lines[i] = f"{m.group(1)}={remaining.pop(m.group(1))}"
    lines += [f"{k}={v}" for k, v in remaining.items()]
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(lines) + "\n")
    os.chmod(path, 0o600)


def main() -> None:
    data = json.load(sys.stdin)
    prompt = data.get("prompt", "")
    root = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
    env_rel = os.environ.get("SECRET_ENV_FILE", ".env")

    body = re.sub(r"^\s*secret[:\s]+", "", prompt, flags=re.I)
    lines = [l for l in body.splitlines() if l.strip()]
    matches = [ASSIGN.match(l) for l in lines]

    if lines and all(matches):
        pairs = {m.group(1): m.group(2) for m in matches}
        upsert_env(os.path.join(root, env_rel), pairs)
        block(f"🔒 Saved {', '.join(pairs)} to {env_rel} — not sent to Claude.")

    if SECRET_VALUE.search(prompt) or any(
        m and SECRET_NAME.search(m.group(1)) and m.group(2) for m in matches
    ):
        block(
            "🔒 This message looks like it contains a secret, so it was NOT sent "
            "to Claude. To store a key, send a message with only KEY=value lines."
        )


if __name__ == "__main__":
    main()
