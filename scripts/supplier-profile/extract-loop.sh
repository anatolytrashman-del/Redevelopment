#!/usr/bin/env bash
# Разбор обойдённых сайтов через Codex пачками, пока обход идёт и пока есть
# неразобранные. Вход: /mnt/project-files/supplier-profiles/raw, выход — tmp/supplier-profiles/out
# (Codex пишет только внутри репозитория) + копия в общую папку проекта.
# Запуск из корня репозитория: nohup scripts/supplier-profile/extract-loop.sh > tmp/supplier-profiles/extract.log 2>&1 &
set -uo pipefail
P=/mnt/project-files/supplier-profiles
IN=tmp/supplier-profiles/in
OUT=tmp/supplier-profiles/out
BATCH=${BATCH:-20}
# Несколько копий параллельно: SHARDS=4 SHARD=0..3 — каждая берёт свои хосты.
SHARDS=${SHARDS:-1}
SHARD=${SHARD:-0}
mkdir -p "$IN" "$OUT" "$P/profiles"

while true; do
  pending=()
  for f in "$P"/raw/*.json; do
    h=$(basename "$f" .json)
    [ -f "$OUT/$h.json" ] && continue
    [ -f "$P/skip/$h" ] && continue
    [ $(( $(printf %s "$h" | cksum | cut -d" " -f1) % SHARDS )) -ne "$SHARD" ] && continue
    # Сайт не открылся — разбирать нечего.
    if [ "$(jq '.pages|length' "$f" 2>/dev/null || echo 0)" -lt 2 ]; then mkdir -p "$P/skip"; touch "$P/skip/$h"; continue; fi
    pending+=("$h")
    [ "${#pending[@]}" -ge "$BATCH" ] && break
  done
  if [ "${#pending[@]}" -eq 0 ]; then
    pgrep -f "[s]upplier-profile/crawl.py" >/dev/null || { echo "$(date +%T) готово"; exit 0; }
    sleep 60; continue
  fi
  python3 scripts/supplier-profile/condense.py "$P/raw" "$P/condensed" "${pending[@]}"
  for h in "${pending[@]}"; do cp "$P/condensed/$h.json" "$IN/"; done
  echo "$(date +%T) пачка: ${pending[*]}"
  prompt="$(cat scripts/supplier-profile/extract-brief.md)

Файлы этого прогона: ${pending[*]}"
  timeout 2400 scripts/codex.sh "$prompt" < /dev/null > tmp/supplier-profiles/codex-last-$SHARD.log 2>&1
  echo "$(date +%T) codex exit $? $(grep -A1 'tokens used' tmp/supplier-profiles/codex-last-$SHARD.log | tail -1)"
  for h in "${pending[@]}"; do
    if [ -f "$OUT/$h.json" ] && python3 -m json.tool "$OUT/$h.json" >/dev/null 2>&1; then
      cp "$OUT/$h.json" "$P/profiles/"
    else
      echo "$(date +%T) нет результата: $h"; mkdir -p "$P/skip"; touch "$P/skip/$h"
    fi
  done
done
