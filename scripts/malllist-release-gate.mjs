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

const YANDEX = ['5893ee662c25f112', 'ea3f37330e9500c7', '1fe0878e43c78b34'];

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function displayedScore(score) {
  if (typeof score !== 'number') return null;
  return Math.round(score * 100);
}

export function summarizeReport(report) {
  const audits = report.audits ?? {};
  const categories = {};
  for (const id of CATEGORIES) {
    categories[id] = displayedScore(report.categories?.[id]?.score);
  }
  const metrics = {};
  for (const id of Object.keys(BUDGETS)) {
    const value = audits[id]?.numericValue;
    metrics[id] = typeof value === 'number' ? value : null;
  }
  const consoleItems = audits['errors-in-console']?.details?.items ?? [];
  const react418 = consoleItems.some((item) => String(item.description ?? '').includes('Minified React error #418'));
  return {
    url: report.finalUrl ?? report.requestedUrl ?? null,
    fetchTime: report.fetchTime ?? null,
    lighthouseVersion: report.lighthouseVersion ?? null,
    categories,
    metrics,
    react418,
  };
}

export function judgeSummaries(summaries, { baseline } = {}) {
  const reasons = [];
  if (!summaries.length) {
    reasons.push('нет отчётов');
    return { ok: false, reasons, median: null };
  }
  const med = { categories: {}, metrics: {} };
  for (const id of CATEGORIES) {
    const values = summaries.map((s) => s.categories[id]).filter((v) => typeof v === 'number');
    med.categories[id] = values.length ? median(values) : null;
    if (med.categories[id] == null) reasons.push(`нет оценки ${id}`);
    else if (med.categories[id] < 90) reasons.push(`${id} ${med.categories[id]} < 90`);
  }
  for (const [id, limit] of Object.entries(BUDGETS)) {
    const values = summaries.map((s) => s.metrics[id]).filter((v) => typeof v === 'number');
    med.metrics[id] = values.length ? median(values) : null;
    if (med.metrics[id] == null) reasons.push(`нет метрики ${id}`);
    else if (med.metrics[id] > limit) reasons.push(`${id} ${Math.round(med.metrics[id])} > ${limit}`);
  }
  if (summaries.some((s) => s.react418)) reasons.push('React hydration error #418 в консоли');
  if (baseline?.categories) {
    for (const id of CATEGORIES) {
      const prev = baseline.categories[id];
      const next = med.categories[id];
      if (typeof prev === 'number' && typeof next === 'number' && next <= prev - 2) {
        reasons.push(`${id} регрессия ${prev} → ${next}`);
      }
    }
  }
  return { ok: reasons.length === 0, reasons, median: med };
}

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

export function checkDistHtml(html, label) {
  const reasons = [];
  if (!/<h1\b/i.test(html)) reasons.push(`${label}: нет h1`);
  if (!/<main\b/i.test(html)) reasons.push(`${label}: нет main`);
  if (!/data-entry-loader/.test(html)) reasons.push(`${label}: нет data-entry-loader`);
  if (!/rel="canonical"/i.test(html)) reasons.push(`${label}: нет canonical`);
  if (/Загружаем каталог…/.test(visibleText(html))) reasons.push(`${label}: в тексте плейсхолдер «Загружаем каталог…»`);
  if (/malllist\.pro/.test(html)) {
    for (const code of YANDEX) {
      if (!html.includes(code)) reasons.push(`${label}: нет yandex-verification ${code}`);
    }
  }
  return reasons;
}

export function checkDistDir(distDir) {
  const reasons = [];
  const files = ['index.html', join('minsk', 'tc', 'index.html')];
  let any = false;
  for (const rel of files) {
    const path = join(distDir, rel);
    if (!existsSync(path)) continue;
    any = true;
    reasons.push(...checkDistHtml(readFileSync(path, 'utf8'), rel));
  }
  if (!any) reasons.push(`в ${distDir} нет index.html и нет minsk/tc/index.html`);
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
  const out = { json: [], runs: 3, url: null, dist: null, outDir: null, baseline: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') out.json.push(argv[++i]);
    else if (arg === '--url') out.url = argv[++i];
    else if (arg === '--runs') out.runs = Number(argv[++i]);
    else if (arg === '--dist') out.dist = argv[++i];
    else if (arg === '--out') out.outDir = argv[++i];
    else if (arg === '--baseline') out.baseline = argv[++i];
    else if (arg === '--help') out.help = true;
    else throw new Error(`неизвестный аргумент ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log(`malllist release gate
  --dist dist
  --url http://127.0.0.1:4173/ [--runs 3] [--out artifacts/malllist-release-gate]
  --json report.json [--json ...]
  --baseline summary.json   регрессия, если категория упала на 2+ пункта
Порог: все 4 категории ≥ 90, бюджеты FCP/LCP/SI/TBT/CLS, нет React #418.`);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || (!args.dist && !args.url && args.json.length === 0)) {
    printHelp();
    return args.help ? 0 : 1;
  }
  const reasons = [];
  if (args.dist) reasons.push(...checkDistDir(resolve(args.dist)));

  const reports = args.json.map((path) => readJson(path));
  if (args.url) {
    if (!Number.isInteger(args.runs) || args.runs < 1 || args.runs > 5) {
      throw new Error('--runs от 1 до 5');
    }
    const outDir = resolve(args.outDir ?? join('artifacts', 'malllist-release-gate'));
    mkdirSync(outDir, { recursive: true });
    for (let i = 1; i <= args.runs; i++) {
      const file = join(outDir, `run-${i}.json`);
      console.log(`[release-gate] прогон ${i}/${args.runs} ${args.url}`);
      runLighthouse(args.url, file);
      reports.push(readJson(file));
    }
  }
  let judgment = null;
  if (reports.length) {
    const summaries = reports.map(summarizeReport);
    const baseline = args.baseline ? readJson(args.baseline) : null;
    judgment = judgeSummaries(summaries, { baseline });
    reasons.push(...judgment.reasons);
    const stamp = new Date().toISOString();
    const summary = {
      measuredAt: stamp,
      note: 'Лабораторный Lighthouse указанного URL. Не PageSpeed Insights UI и не CrUX.',
      urls: summaries.map((s) => s.url),
      lighthouseVersion: summaries[0]?.lighthouseVersion ?? null,
      runs: summaries,
      median: judgment.median,
      ok: judgment.ok && reasons.length === judgment.reasons.length,
    };
    if (args.outDir || args.url) {
      const outDir = resolve(args.outDir ?? join('artifacts', 'malllist-release-gate'));
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    }
    console.log(JSON.stringify({ measuredAt: stamp, median: judgment.median, ok: reasons.length === 0 }, null, 2));
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
