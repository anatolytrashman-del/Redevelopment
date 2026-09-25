// Оценка трафика (egress) Supabase REST за сутки и прогноз на месяц.
//
// Зачем (2026-09-24): 23.09 проект закрыли за превышение трафика, и точной
// цифры «сколько ГБ съели» из сессии не достать — счётчик биллинга живёт в
// дашборде, Management API его не отдаёт, а в edge-логах у больших ответов
// нет content-length (они идут чанками). Поэтому оценка: из логов берём,
// какие запросы и сколько раз ходили, каждый уникальный запрос повторяем
// один раз под ролью anon и меряем вес ответа (сжатый gzip — так отдают
// браузер и node; несжатый — верхняя граница). Запросы, которые anon не
// видит (админка под логином), в сумму не попадают — они мелкие, но это
// нижняя оценка, а не бухгалтерия.
//
// Запуск из сессии с SUPABASE_ACCESS_TOKEN:
//   node scripts/supabase-egress-report.mjs            # последние 24 часа
//   node scripts/supabase-egress-report.mjs --top=80   # сколько запросов мерить
// Сам прогон тратит ~5–15 МБ трафика (по одному ответу на запрос).
import { gzipSync } from 'node:zlib';

const REF = 'iohcdylttyuhwovztrbk';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = `https://${REF}.supabase.co`;
const ANON_KEY = 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
const PRO_EGRESS_GB = 250;
// Цель владельца с 2026-09-24 — бесплатный тариф: 5 ГБ в месяц ≈ 165 МБ в сутки.
const FREE_EGRESS_GB = 5;
const ALERT_MB = Number(process.argv.find((a) => a.startsWith('--alert-mb='))?.split('=')[1] ?? 150);

if (!TOKEN) {
  console.error('[egress] нет SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const TOP = Number(process.argv.find((a) => a.startsWith('--top='))?.split('=')[1] ?? 60);
const end = new Date();
const start = new Date(end.getTime() - 24 * 3600 * 1000);

async function logs(sql) {
  const url = new URL(`https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/logs`);
  url.searchParams.set('sql', sql);
  url.searchParams.set('iso_timestamp_start', start.toISOString());
  url.searchParams.set('iso_timestamp_end', end.toISOString());
  // Лимит частоты у эндпоинта логов жёсткий (ThrottlerException) — ждём и повторяем.
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const body = await res.json();
    if (res.ok && !body.error) return body.result ?? [];
    const message = JSON.stringify(body.error ?? body).slice(0, 300);
    if (attempt < 5 && (res.status === 429 || message.includes('Too Many Requests'))) {
      await new Promise((r) => setTimeout(r, attempt * 20_000));
      continue;
    }
    throw new Error(`logs: ${message}`);
  }
}

// Откуда пришёл запрос — по user-agent и адресу. Диапазоны грубые, но
// различают главное: CI на GitHub (Azure), сессии Claude/Codex (Google
// Cloud), сборки Vercel (AWS), живые посетители и админка (браузер).
// Эндпоинт logs.all Supabase убрал 2026-09-24: теперь единая таблица logs на
// ClickHouse, источник — колонка source, поля запроса — в словаре log_attributes.
const A = (key) => `log_attributes['${key}']`;
const UA = A('request.headers.user_agent');
const IP = A('request.headers.cf_connecting_ip');
const SOURCE_SQL = `multiIf(
  ${UA} like 'Deno%' or ${UA} like 'pg_net%' or ${UA} like 'supabase-edge%', 'фоновые функции',
  ${A('request.headers.referer')} like 'http://localhost%', 'пререндер/локальный браузер',
  ${UA} in ('node', 'undici') and match(${IP}, '^(20|52|13|40|4|135|172|64|68|74|191)\\.'), 'CI GitHub',
  ${UA} in ('node', 'undici') and match(${IP}, '^(34|35|136|146)\\.'), 'сессии Claude/Codex',
  ${UA} in ('node', 'undici'), 'сборки Vercel и прочие скрипты',
  ${UA} like 'Mozilla%', 'браузер (сайт/админка)',
  if(${UA} = '', '—', substring(${UA}, 1, 24)))`;

const rows = await logs(`select ${A('request.path')} p, ${A('request.search')} s, ${SOURCE_SQL} src, count() n
  from logs
  where source = 'edge_logs' and ${A('request.method')} = 'GET' and startsWith(${A('request.path')}, '/rest/v1/')
  group by p, s, src order by n desc limit 2000`);

const byQuery = new Map();
for (const r of rows) {
  const key = r.p + (r.s ?? '');
  const entry = byQuery.get(key) ?? { total: 0, bySource: {} };
  entry.total += r.n;
  entry.bySource[r.src] = (entry.bySource[r.src] ?? 0) + r.n;
  byQuery.set(key, entry);
}
const ranked = [...byQuery.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, TOP);

// Один запрос на форму: несжатый вес — длина тела, сжатый — тот же ответ
// через gzip (так его и отдаёт Supabase клиентам с Accept-Encoding).
async function measure(key) {
  const res = await fetch(`${SUPABASE_URL}${key}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return { raw: buf.length, gz: gzipSync(buf).length };
}

let gzTotal = 0;
let rawTotal = 0;
const sourceGz = {};
const heavy = [];
for (let i = 0; i < ranked.length; i += 6) {
  await Promise.all(
    ranked.slice(i, i + 6).map(async ([key, entry]) => {
      const m = await measure(key).catch(() => null);
      if (!m) return;
      gzTotal += m.gz * entry.total;
      rawTotal += m.raw * entry.total;
      for (const [src, n] of Object.entries(entry.bySource)) sourceGz[src] = (sourceGz[src] ?? 0) + m.gz * n;
      heavy.push({ key, n: entry.total, gz: m.gz * entry.total });
    }),
  );
}

const counts = await logs(`select ${SOURCE_SQL} src, count() n
  from logs where source = 'edge_logs'
  group by src order by n desc`);

const gb = (b) => (b / 1e9).toFixed(2);
const mb = (b) => (b / 1e6).toFixed(1);
console.log(`Supabase egress, оценка за ${start.toISOString().slice(0, 16)} … ${end.toISOString().slice(0, 16)} UTC`);
console.log(`REST, сжатый ответ: ${gb(gzTotal)} ГБ/сутки → ~${((gzTotal / 1e9) * 30).toFixed(1)} ГБ/мес (Free ${FREE_EGRESS_GB}, Pro ${PRO_EGRESS_GB})`);
console.log(gzTotal / 1e6 > ALERT_MB ? `ПРЕВЫШЕНИЕ: ${mb(gzTotal)} МБ за сутки при пороге ${ALERT_MB} МБ` : `в норме: ${mb(gzTotal)} МБ за сутки при пороге ${ALERT_MB} МБ`);
console.log(`REST, верхняя граница (без сжатия): ${gb(rawTotal)} ГБ/сутки → ~${Math.round((rawTotal / 1e9) * 30)} ГБ/мес`);
console.log('\nПо источникам (сжатый вес):');
for (const [src, b] of Object.entries(sourceGz).sort((a, b) => b[1] - a[1])) console.log(`  ${mb(b).padStart(8)} МБ  ${src}`);
console.log('\nЗапросов всего (все методы, все сервисы):');
for (const r of counts) console.log(`  ${String(r.n).padStart(7)}  ${r.src}`);
console.log('\nСамые тяжёлые запросы (сжатый вес × число):');
for (const h of heavy.sort((a, b) => b.gz - a.gz).slice(0, 12)) {
  console.log(`  ${mb(h.gz).padStart(8)} МБ  ×${String(h.n).padEnd(5)} ${decodeURIComponent(h.key).slice(9, 120)}`);
}
