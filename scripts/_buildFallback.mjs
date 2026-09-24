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

// Сборки вне Vercel (CI на GitHub, сессии Claude/Codex) в базу не ходят
// вовсе, а берут снимки (2026-09-24). Замер по логам Supabase за сутки
// 23→24.09: из ~250 прогонов generate-catalog-data ~140 были CI на GitHub
// (PR + пуш в прод-ветку — каждый дважды) и ~100 — сборки в сессиях; на
// Vercel — около двадцати. Каждый прогон качает весь каталог (~12 МБ
// несжатыми), то есть ~90% трафика базы шло на сборки, результат которых
// никто не публикует. Живые данные нужны только сборке, которая уезжает на
// сайт; проверить сборку можно и на снимке. Вернуть базу локально —
// BUILD_DATA_LIVE=1.
export function buildDataOffline() {
  return !process.env.VERCEL && process.env.BUILD_DATA_LIVE !== '1';
}

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
export function fallbackRows(query, tag, { quiet = false } = {}) {
  const snap = loadSnapshot();
  const rows = snap?.queries?.[query];
  if (!Array.isArray(rows)) return null;
  if (!quiet) {
    console.warn(`[${tag}] Supabase недоступен — «${query}» взят из снимка от ${snap.generatedAt} (scripts/supabase-build-fallback.json)`);
  }
  return rows;
}

// Сборка вне Vercel: ответ из снимка, если он там есть (null — идти в базу,
// как раньше: запрос, которого нет в снимке, лучше отдать живым, чем уронить
// сборку). Пишет одну строку на скрипт, а не по строке на запрос.
const announced = new Set();
export function offlineRows(query, tag) {
  if (!buildDataOffline()) return null;
  const rows = fallbackRows(query, tag, { quiet: true });
  if (rows && !announced.has(tag)) {
    announced.add(tag);
    console.log(`[${tag}] сборка вне Vercel — данные из снимков, не из базы (BUILD_DATA_LIVE=1 вернёт базу)`);
  }
  return rows;
}
