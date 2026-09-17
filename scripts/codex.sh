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

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Файлы заданий в docs/codex-tasks/ написаны под облачный Codex и велят завести
# ветку и открыть PR. В канале 1 это не так: ветку сессии назначает харнесс, а
# PR открывает Claude (gh в контейнере нет). Поэтому к любому ТЗ из файла
# автоматически подклеивается приписка с правилами этого канала — чтобы каждая
# новая сессия не сочиняла её заново и не забывала.
ADDENDUM="$REPO_ROOT/docs/codex-tasks/_cli-addendum.md"

if [ "${1:-}" = "-f" ]; then
  [ -f "${2:-}" ] || { echo "Файл с ТЗ не найден: ${2:-<не задан>}" >&2; exit 2; }
  PROMPT="$(cat "$2")"
  if [ -f "$ADDENDUM" ]; then
    PROMPT="$PROMPT
$(cat "$ADDENDUM")"
  fi
else
  PROMPT="$*"
fi

# Учётные данные: либо уже лежат в ~/.codex/auth.json, либо приезжают из окружения.
# CODEX_AUTH_JSON принимается в двух видах: сырой JSON или он же в base64.
# Base64 — рабочий вариант для настроек окружения Claude Code на вебе: поле там в
# формате .env (одна строка `KEY=value`), а auth.json многострочный, с кавычками и
# пробелами — вставленный как есть, он ломает разбор («Couldn't parse … Use KEY=value
# format», проверено 2026-09-17). Base64 не содержит ни переносов, ни кавычек.
if [ ! -f "$HOME/.codex/auth.json" ]; then
  if [ -n "${CODEX_AUTH_JSON:-}" ]; then
    mkdir -p "$HOME/.codex"
    case "$(printf '%s' "$CODEX_AUTH_JSON" | cut -c1)" in
      '{') printf '%s' "$CODEX_AUTH_JSON" > "$HOME/.codex/auth.json" ;;
      *)   printf '%s' "$CODEX_AUTH_JSON" | tr -d '\n' | base64 -d > "$HOME/.codex/auth.json" 2>/dev/null || {
             echo "[codex.sh] CODEX_AUTH_JSON не похож ни на JSON, ни на base64 от него." >&2
             exit 3
           } ;;
    esac
    chmod 600 "$HOME/.codex/auth.json"
    grep -q '"' "$HOME/.codex/auth.json" || {
      echo "[codex.sh] Расшифрованный auth.json выглядит пустым или битым." >&2
      exit 3
    }
  else
    cat >&2 <<'MSG'
Нет учётных данных Codex.
Владельцу: на машине, где стоит Codex CLI, выполнить `codex login` (Sign in with ChatGPT),
затем `base64 < ~/.codex/auth.json | tr -d '\n' | pbcopy` и вставить результат в переменную
окружения CODEX_AUTH_JSON (настройки окружения Claude Code на вебе, формат KEY=value одной
строкой). Она подхватится СЛЕДУЮЩЕЙ сессией.
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
#
# --sandbox workspace-write обязателен: по умолчанию `codex exec` идёт в read-only и
# молча не может записать ни одного файла — задача «отвечает», но диф пустой
# (проверено 2026-09-17 на первом живом запуске). Переопределяется переменной
# CODEX_SANDBOX, если понадобится read-only для чисто аналитической задачи.
exec codex exec --skip-git-repo-check --sandbox "${CODEX_SANDBOX:-workspace-write}" "$PROMPT"
