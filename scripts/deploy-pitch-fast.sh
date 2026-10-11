#!/usr/bin/env bash
# Быстрый деплой ТОЛЬКО лендинга /zakupki — без сборки сайта.
# После push на origin страница доступна через CDN (секунды, не минуты Vercel).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="public/zakupki"
BRANCH="${1:-}"

if [[ ! -f "$ROOT/$DIR/index.html" ]]; then
  echo "нет $DIR/index.html" >&2
  exit 1
fi

cd "$ROOT"
SHA="$(git rev-parse HEAD)"
if [[ -n "$BRANCH" ]]; then
  REF="$BRANCH"
else
  REF="$SHA"
fi

# jsDelivr кэширует по коммиту/тегу; ветка с / в имени — через @branch-name с заменой
# (для веток с слэшем надёжнее SHA).
URL_JSDELIVR="https://cdn.jsdelivr.net/gh/anatolytrashman-del/Redevelopment@${SHA}/${DIR}/"
URL_GITHACK="https://raw.githack.com/anatolytrashman-del/Redevelopment/${SHA}/${DIR}/index.html"

echo "Пакет: $DIR ($(du -sh "$DIR" | awk '{print $1}'))"
echo "Коммит: $SHA"
echo
echo "Мгновенные URL (после git push):"
echo "  $URL_JSDELIVR"
echo "  $URL_GITHACK"
echo
echo "Прод сайта: https://redevelopment.pro/zakupki/"
