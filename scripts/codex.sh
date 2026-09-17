#!/usr/bin/env bash
# Обёртка для запуска Codex (ChatGPT Pro) из сессии Claude Code.
# Зачем: переложить на Codex часть работы, пока недельный лимит Claude на исходе.
# Протокол и разделение труда — docs/codex-handoff.md, правила для Codex — AGENTS.md.
#
#   scripts/codex.sh "текст задачи"
#   scripts/codex.sh -f путь/к/тз.md
#
# Требует: домены chatgpt.com / auth.openai.com / api.openai.com в Allowed domains
# и переменную CODEX_AUTH_JSON (содержимое ~/.codex/auth.json после `codex login`).

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Использование: $0 \"текст задачи\" | $0 -f файл-с-ТЗ.md" >&2
  exit 2
fi

if [ "${1:-}" = "-f" ]; then
  [ -f "${2:-}" ] || { echo "Файл с ТЗ не найден: ${2:-<не задан>}" >&2; exit 2; }
  PROMPT="$(cat "$2")"
else
  PROMPT="$*"
fi

# Учётные данные: либо уже лежат в ~/.codex/auth.json, либо приезжают из окружения.
if [ ! -f "$HOME/.codex/auth.json" ]; then
  if [ -n "${CODEX_AUTH_JSON:-}" ]; then
    mkdir -p "$HOME/.codex"
    printf '%s' "$CODEX_AUTH_JSON" > "$HOME/.codex/auth.json"
    chmod 600 "$HOME/.codex/auth.json"
  else
    cat >&2 <<'MSG'
Нет учётных данных Codex.
Владельцу: на машине, где стоит Codex CLI, выполнить `codex login` (Sign in with ChatGPT)
и положить содержимое ~/.codex/auth.json в переменную окружения CODEX_AUTH_JSON
(настройки окружения Claude Code на вебе). Она подхватится СЛЕДУЮЩЕЙ сессией.
MSG
    exit 3
  fi
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "[codex.sh] Ставлю @openai/codex..." >&2
  npm install -g @openai/codex >/dev/null 2>&1 || {
    echo "[codex.sh] npm install -g @openai/codex не прошёл — проверь доступ к registry.npmjs.org" >&2
    exit 4
  }
fi

# exec — неинтерактивный режим; правки в рабочем дереве, без своих коммитов:
# ветку, коммит и PR делает вызывающая сторона, чтобы соблюсти правила ветвления.
exec codex exec --skip-git-repo-check "$PROMPT"
