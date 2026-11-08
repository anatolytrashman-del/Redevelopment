/**
 * Порог перед выпуском malllist.pro.
 *
 *   npm run malllist:release-gate -- --dist dist
 *   npm run malllist:release-gate -- --url http://127.0.0.1:4173/ --runs 3 --out artifacts/malllist-release-gate
 *   npm run malllist:release-gate -- --json a.json --json b.json --json c.json
 *
 * Мобильный Lighthouse (simulated, Moto G Power), медиана прогонов.
 * Ненулевой код, если категория < 90, метрика хуже бюджета, в консоли
 * React #418, или в dist сломан пререндер / пропала yandex-verification.
 *
 * Это лабораторный прогон указанного URL, не отчёт PageSpeed Insights UI
 * и не полевой CrUX. Локальный preview не подменяет балл прода.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

/** Лабораторные потолки. Категории — отдельно, порог 90. */
export const BUDGETS = {
  'first-contentful-paint': 2000,
  'largest-contentful-paint': 3000,
  'speed-index': 3800,
  'total-blocking-time': 200,
  'cumulative-layout-shift': 0.1,
};

const DOMAIN_SPLIT = JSON.parse(readFileSync(join(ROOT, 'src/data/domain-split.json'), 'utf8'));

const HYDRATION_ERROR = /Minified React error #(?:418|423|425)|Hydration failed/;

function yandexCodesForHost(host) {
  const bare = String(host || '').replace(/^www\./, '').toLowerCase();
  const block =
    bare === DOMAIN_SPLIT.malls?.host
      ? DOMAIN_SPLIT.verifications?.malls
      : bare === DOMAIN_SPLIT.offices?.host
        ? DOMAIN_SPLIT.verifications?.offices
        : null;
  if (!block?.yandex) return [];
  return [block.yandex, ...(Array.isArray(block.yandexExtra) ? block.yandexExtra : [])].filter(Boolean);
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function displayedScore(score) {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return null;
  return Math.round(score * 100);
}

function finiteMetric(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function sameRoute(a, b) {
  try {
    const left = new URL(a);
    const right = new URL(b);
    const path = (value) => value.pathname.replace(/\/+$/, '') || '/';
    return left.origin === right.origin && path(left) === path(right);
  } catch {
    return false;
  }
}

export function assertHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`не URL: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`не http(s): ${value}`);
  return url.href;
}

/** Отображаемый балл Lighthouse (округление). Бюджет метрики включительный: значение ровно на пороге проходит. */
export function summarizeReport(report) {
  const invalid = [];
  if (!report || typeof report !== 'object') {
    return { url: null, categories: {}, metrics: {}, react418: false, invalid: ['пустой отчёт'] };
  }
  if (report.runtimeError) invalid.push('runtimeError Lighthouse');
  const audits = report.audits ?? {};
  const categories = {};
  for (const id of CATEGORIES) {
    const raw = report.categories?.[id]?.score;
    categories[id] = displayedScore(raw);
    if (categories[id] == null) invalid.push(`нет конечной оценки ${id}`);
  }
  const metrics = {};
  for (const id of Object.keys(BUDGETS)) {
    const value = audits[id]?.numericValue;
    metrics[id] = finiteMetric(value) ? value : null;
    if (metrics[id] == null) invalid.push(`нет конечной метрики ${id}`);
  }
  const consoleAudit = audits['errors-in-console'];
  if (!consoleAudit || consoleAudit.scoreDisplayMode === 'error') invalid.push('нет аудита errors-in-console');
  const consoleItems = consoleAudit?.details?.items ?? [];
  const react418 = consoleItems.some((item) => HYDRATION_ERROR.test(String(item.description ?? '') + String(item.url ?? '')));
  if (report.requestedUrl && report.finalUrl && !sameRoute(report.requestedUrl, report.finalUrl)) {
    invalid.push(`finalUrl ${report.finalUrl} не совпал с ${report.requestedUrl}`);
  }
  return {
    url: report.finalUrl ?? report.requestedUrl ?? null,
    fetchTime: report.fetchTime ?? null,
    lighthouseVersion: report.lighthouseVersion ?? null,
    categories,
    metrics,
    react418,
    invalid,
  };
}

export function readBaselineCategories(baseline, url) {
  if (!baseline || typeof baseline !== 'object') return { error: 'baseline пуст' };
  if (baseline.categories && typeof baseline.categories.performance === 'number') {
    return { categories: baseline.categories };
  }
  if (baseline.median?.categories && typeof baseline.median.categories.performance === 'number') {
    return { categories: baseline.median.categories };
  }
  if (Array.isArray(baseline.pages)) {
    const page = baseline.pages.find((item) => item?.url === url) ?? null;
    if (!page) return { error: 'baseline.pages без URL этого прогона' };
    if (page.median?.categories && typeof page.median.categories.performance === 'number') {
      return { categories: page.median.categories };
    }
    return { error: 'baseline.pages без median.categories' };
  }
  return { error: 'baseline без categories' };
}

export function judgeSummaries(summaries, { baseline } = {}) {
  const reasons = [];
  if (!summaries.length) {
    reasons.push('нет отчётов');
    return { ok: false, reasons, median: null };
  }
  for (const summary of summaries) {
    for (const problem of summary.invalid ?? []) reasons.push(problem);
  }
  const med = { categories: {}, metrics: {} };
  for (const id of CATEGORIES) {
    const values = summaries.map((s) => s.categories[id]);
    if (values.some((value) => typeof value !== 'number')) {
      reasons.push(`неполный прогон: ${id}`);
      continue;
    }
    med.categories[id] = median(values);
    if (med.categories[id] < 90) reasons.push(`${id} ${med.categories[id]} < 90`);
  }
  for (const [id, limit] of Object.entries(BUDGETS)) {
    const values = summaries.map((s) => s.metrics[id]);
    if (values.some((value) => !finiteMetric(value))) {
      reasons.push(`неполный прогон: ${id}`);
      continue;
    }
    med.metrics[id] = median(values);
    if (med.metrics[id] > limit) reasons.push(`${id} ${Math.round(med.metrics[id])} > ${limit}`);
  }
  if (summaries.some((s) => s.react418)) reasons.push('React hydration error #418/#423/#425 в консоли');
  if (baseline) {
    const read = readBaselineCategories(baseline, summaries[0]?.url);
    if (read.error) reasons.push(read.error);
    else {
      for (const id of CATEGORIES) {
        const prev = read.categories[id];
        const next = med.categories[id];
        if (typeof prev === 'number' && typeof next === 'number' && next <= prev - 2) {
          reasons.push(`${id} регрессия ${prev} → ${next}`);
        }
      }
    }
  }
  return { ok: reasons.length === 0, reasons, median: med };
}

function markup(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

export const REQUIRED_DIST_FILES = [
  'index.html',
  join('minsk', 'tc', 'index.html'),
  join('minsk', 'tc', '4-sezona-bedy', 'index.html'),
];

export function checkDistHtml(html, label) {
  const reasons = [];
  const body = markup(html);
  const h1 = body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1 || !h1[1].replace(/<[^>]+>/g, '').trim()) reasons.push(`${label}: нет непустого h1`);
  const main = body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (!main || !main[1].replace(/<[^>]+>/g, '').trim()) reasons.push(`${label}: нет непустого main`);
  const noComments = html.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<script\b[^>]*data-entry-loader\b/i.test(noComments)) reasons.push(`${label}: нет script data-entry-loader`);
  const canons = [...body.matchAll(/<link\b[^>]*>/gi)].filter((m) => /\brel=["']canonical["']/i.test(m[0]));
  if (canons.length !== 1) reasons.push(`${label}: canonical не один (${canons.length})`);
  const href = canons[0] ? /href=["']([^"']+)["']/i.exec(canons[0][0]) : null;
  if (!href) reasons.push(`${label}: у canonical нет href`);
  else {
    let host = '';
    try { host = new URL(href[1]).host; } catch { reasons.push(`${label}: canonical href не URL`); }
    const metas = [...body.matchAll(/<meta\b[^>]*>/gi)]
      .filter((m) => /\bname=["']yandex-verification["']/i.test(m[0]))
      .map((m) => /content=["']([^"']+)["']/i.exec(m[0])?.[1])
      .filter(Boolean);
    for (const code of yandexCodesForHost(host)) {
      if (!metas.includes(code)) reasons.push(`${label}: нет meta yandex-verification ${code}`);
    }
  }
  if (/Загружаем каталог…/.test(body.replace(/<[^>]+>/g, ' '))) reasons.push(`${label}: в тексте плейсхолдер «Загружаем каталог…»`);
  if (/id=["']tc-browse-body["']/.test(body) && !/data-catalog-menu-grid/.test(body)) {
    reasons.push(`${label}: нет data-catalog-menu-grid в снапшоте меню`);
  }
  return reasons;
}

export function checkDistDir(distDir) {
  const reasons = [];
  for (const rel of REQUIRED_DIST_FILES) {
    const path = join(distDir, rel);
    if (!existsSync(path)) {
      reasons.push(`нет ${rel}`);
      continue;
    }
    reasons.push(...checkDistHtml(readFileSync(path, 'utf8'), rel));
  }
  return reasons;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function lighthouseBin() {
  if (process.env.LIGHTHOUSE_BIN) return process.env.LIGHTHOUSE_BIN;
  const local = join(ROOT, 'node_modules', '.bin', 'lighthouse');
  if (existsSync(local)) return local;
  return null;
}

function runLighthouse(url, outFile) {
  const bin = lighthouseBin();
  const args = [
    url,
    '--only-categories=performance,accessibility,best-practices,seo',
    '--form-factor=mobile',
    '--screenEmulation.mobile',
    '--throttling-method=simulate',
    '--output=json',
    `--output-path=${outFile}`,
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage',
    '--max-wait-for-load=60000',
    '--quiet',
  ];
  const cmd = bin ?? 'npx';
  const cmdArgs = bin ? args : ['--yes', 'lighthouse@13.6.0', ...args];
  const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit', timeout: 180000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`lighthouse завершился с кодом ${result.status}`);
}

function parseArgs(argv) {
  const out = { json: [], runs: 3, urls: [], dist: null, outDir: null, baseline: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') out.json.push(argv[++i]);
    else if (arg === '--url') out.urls.push(argv[++i]);
    else if (arg === '--urls') out.urls.push(...String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--runs') out.runs = Number(argv[++i]);
    else if (arg === '--dist') out.dist = argv[++i];
    else if (arg === '--out') out.outDir = argv[++i];
    else if (arg === '--baseline') out.baseline = argv[++i];
    else if (arg === '--help') out.help = true;
    else throw new Error(`неизвестный аргумент ${arg}`);
  }
  if (process.env.GATE_URLS) {
    out.urls.push(...process.env.GATE_URLS.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return out;
}

function printHelp() {
  console.log(`malllist release gate
  --dist dist
  --url URL [--url URL ...] [--runs 3] [--out artifacts/malllist-release-gate]
  GATE_URLS=url1,url2  тот же список, без подстановки в shell
  --json report.json [--json ...]
  --baseline summary.json   регрессия, если категория упала на 2+ пункта
Порог: все 4 категории ≥ 90, бюджеты FCP/LCP/SI/TBT/CLS, нет React #418/#423/#425.
Каждый URL судится отдельно (медиана своих прогонов).`);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || (!args.dist && args.urls.length === 0 && args.json.length === 0)) {
    printHelp();
    return args.help ? 0 : 1;
  }
  const reasons = [];
  if (args.dist) reasons.push(...checkDistDir(resolve(args.dist)));

  const reports = args.json.map((path) => readJson(path));
  const byUrl = new Map();
  if (args.urls.length) {
    if (!Number.isInteger(args.runs) || args.runs < 1 || args.runs > 5) {
      throw new Error('--runs от 1 до 5');
    }
    const outDir = resolve(args.outDir ?? join('artifacts', 'malllist-release-gate'));
    mkdirSync(outDir, { recursive: true });
    for (const url of args.urls) {
      assertHttpUrl(url);
      const slug = url.replace(/https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
      const bucket = [];
      for (let i = 1; i <= args.runs; i++) {
        const file = join(outDir, `${slug}-run-${i}.json`);
        console.log(`[release-gate] прогон ${i}/${args.runs} ${url}`);
        runLighthouse(url, file);
        const report = readJson(file);
        bucket.push(report);
        reports.push(report);
      }
      byUrl.set(url, bucket);
    }
  }
  if (reports.length) {
    const baseline = args.baseline ? readJson(args.baseline) : null;
    const groups = byUrl.size ? [...byUrl.values()] : [reports];
    const medians = [];
    for (const group of groups) {
      const summaries = group.map(summarizeReport);
      const judgment = judgeSummaries(summaries, { baseline });
      reasons.push(...judgment.reasons.map((reason) => `${summaries[0]?.url ?? ''}: ${reason}`.trim()));
      medians.push({ url: summaries[0]?.url ?? null, median: judgment.median, ok: judgment.ok });
    }
    const stamp = new Date().toISOString();
    if (args.outDir || args.urls.length) {
      const outDir = resolve(args.outDir ?? join('artifacts', 'malllist-release-gate'));
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'summary.json'), JSON.stringify({
        measuredAt: stamp,
        note: 'Лабораторный Lighthouse указанных URL. Не PageSpeed Insights UI и не CrUX.',
        pages: medians,
      }, null, 2));
    }
    console.log(JSON.stringify({ measuredAt: stamp, pages: medians, ok: reasons.length === 0 }, null, 2));
  }
  if (reasons.length) {
    console.error('[release-gate] НЕ ПРОЙДЕН');
    for (const reason of reasons) console.error(`  - ${reason}`);
    return 1;
  }
  console.log('[release-gate] пройден');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (err) {
    console.error('[release-gate]', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
