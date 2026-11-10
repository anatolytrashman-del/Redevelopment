// Список живых карточек каталогов для middleware (аудит SEO 2026-11-10).
// Удалённые/скрытые ТЦ и БЦ раньше отдавали 200 с главной и canonical «/»
// (soft-404). Middleware по этому файлу отвечает 410 на /minsk/tc/<slug> и
// /minsk/bc/<slug>, которых нет в данных сборки. Если файла нет или он пуст —
// middleware ничего не режет (fail-open), поэтому при сбое данных сборка не
// превращает живые карточки в 410.
//
// aliases — одиночные сегменты с постоянным редиректом в vercel.json
// (port-2 → port, reyting → rating…): middleware выполняется раньше
// redirects из vercel.json и не должен их перехватывать.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIST_DATA = resolve(process.cwd(), 'dist/data');
const OUT = resolve(DIST_DATA, 'catalog-slugs.json');
const MIN_ROWS = 50;

function slugsOf(file, kind) {
  const path = resolve(DIST_DATA, file);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.rows) ? raw.rows : [];
    const slugs = rows
      .filter((r) => !kind || !r?.kind || r.kind === kind)
      .map((r) => r?.slug)
      .filter((s) => typeof s === 'string' && /^[a-z0-9-]+$/.test(s));
    return [...new Set(slugs)].sort();
  } catch {
    return null;
  }
}

export function redirectAliases(vercelConfig) {
  const out = { tc: new Set(), bc: new Set() };
  for (const r of vercelConfig?.redirects ?? []) {
    // Правила с has (host redevelopment.pro) на каталожном домене не срабатывают.
    if (Array.isArray(r?.has) && r.has.length) continue;
    const m = /^\/minsk\/(tc|bc)\/([a-z0-9-]+)(?:\{\/\}\?)?$/.exec(r?.source ?? '');
    if (m) out[m[1]].add(m[2]);
  }
  return { tc: [...out.tc].sort(), bc: [...out.bc].sort() };
}

function main() {
  const tc = slugsOf('trade-centers.json', 'tc');
  const bc = slugsOf('business-centers.json', 'bc');
  if (!tc || !bc || tc.length < MIN_ROWS || bc.length < MIN_ROWS) {
    console.warn(
      `[catalog-slugs] мало данных (tc=${tc?.length ?? 'нет'}, bc=${bc?.length ?? 'нет'}) — файл не пишу, 410 в middleware выключен`,
    );
    return;
  }
  let aliases = { tc: [], bc: [] };
  try {
    aliases = redirectAliases(JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')));
  } catch (e) {
    console.warn(`[catalog-slugs] vercel.json не прочитан: ${e?.message ?? e}`);
  }
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), tc, bc, aliases }));
  console.log(`[catalog-slugs] tc=${tc.length} bc=${bc.length} aliases tc=${aliases.tc.length} bc=${aliases.bc.length}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) main();
