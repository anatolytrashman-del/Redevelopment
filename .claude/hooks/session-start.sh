#!/bin/bash
set -euo pipefail

# Only relevant for Claude Code on the web / remote sessions — each session
# runs in a fresh, ephemeral container, so anything installed into the
# user home directory (like a Claude Code plugin) does not survive between
# sessions and needs to be reinstalled every time.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# llm-wiki (https://llm-wiki.net) — Claude Code plugin for building
# LLM-compiled knowledge bases (parallel research, thesis-driven fact
# checking, source compilation). Both commands are already idempotent
# (no-op with exit 0 if already present), so this is safe to run on
# every session start.
claude plugin marketplace add nvk/llm-wiki
claude plugin install wiki@llm-wiki
