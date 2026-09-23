// Запасной путь сборки на случай, когда Supabase недоступен целиком
// (2026-09-23: проект закрыли за превышение трафика бесплатного плана —
// 402 exceed_egress_quota на ЛЮБОЙ запрос, и каждая сборка падала на первом
// же select'е, так что даже исправление самого сайта не могло доехать до
// прода).
//
// Списки путей для карты сайта и пререндера берутся из
// scripts/supabase-build-fallback.json — снимка ответов на те же запросы
// (ключ — строка запроса к PostgREST ровно как в скриптах, снимался под
// ролью anon через Management API; обновлять тем же способом, если снимок
// заметно отстал). Данные каталога копирует с прода generate-catalog-data.mjs.
// Устаревшие, но настоящие данные лучше упавшей сборки, из-за которой прод
// остаётся без исправлений, пока база не вернётся.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FALLBACK_PATH = resolve(process.cwd(), 'scripts/supabase-build-fallback.json');

let snapshot;
function loadSnapshot() {
  if (snapshot === undefined) {
    try {
      snapshot = JSON.parse(readFileSync(FALLBACK_PATH, 'utf8'));
    } catch {
      snapshot = null;
    }
  }
  return snapshot;
}

// Ответ на запрос из снимка или null, если такого запроса в снимке нет —
// тогда вызывающий бросает исходную ошибку, как без запасного пути.
export function fallbackRows(query, tag) {
  const snap = loadSnapshot();
  const rows = snap?.queries?.[query];
  if (!Array.isArray(rows)) return null;
  console.warn(`[${tag}] Supabase недоступен — «${query}» взят из снимка от ${snap.generatedAt} (scripts/supabase-build-fallback.json)`);
  return rows;
}
