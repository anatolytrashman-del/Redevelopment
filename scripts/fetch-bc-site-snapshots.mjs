// Скачивает текст с официальных сайтов бизнес-центров (business_centers.website)
// и кладёт его в business_centers.official_site_snapshot_text — БЕЗ единого
// обращения к какой-либо модели/ProxyAPI (владелец, 2026-09-22: "проксиапи не
// используй вообще"). Разбор сырого текста в структурированные факты
// (building_facts/highlights) делает Claude вручную по каждому БЦ в отдельной
// сессии, читая уже сохранённый снимок прямо из базы — сеть на этом шаге не
// нужна вовсе.
//
// Запускается на раннере GitHub Actions (обычный интернет), а не в песочнице
// Claude Code on the web — та же причина, по которой process-supplier-
// enrichment-jobs.mjs читает сайты поставщиков напрямую с раннера: у сессии
// egress-прокси блокирует произвольные внешние домены, у раннера — нет.
//
// Логика скачивания (редиректы, откат без проверки сертификата, лимит
// размера, браузерный User-Agent) — тот же паттерн, что в
// process-supplier-enrichment-jobs.mjs (fetchPage/fetchFromPagesDirectly),
// продублирован намеренно: это generic HTTP-код, не бизнес-правило вроде НДС
// или бот-детекта из CLAUDE.md, где расхождение копий было бы багом.

import { createClient } from '@supabase/supabase-js';
import https from 'node:https';
import http from 'node:http';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1]) || null;
const ONLY_SLUG = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1] ?? null;

const TEST_URL = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ?? null;

if (!SUPABASE_SERVICE_ROLE_KEY && !TEST_URL) {
  console.error('Не задана переменная окружения SUPABASE_SERVICE_ROLE_KEY (или запусти с --url=<сайт> для теста без базы)');
  process.exit(1);
}

const supabase = SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;

const PAGE_FETCH_TIMEOUT_MS = 15000;
const MAX_PAGE_BYTES = 500_000;
// Суммарный текст на один БЦ — иначе у сайтов с десятками подстраниц снимок
// раздувается без пользы: Claude потом читает это вручную по одному БЦ.
const MAX_TOTAL_TEXT_CHARS = 45_000;
const MAX_PAGES_PER_SITE = 6;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

// Типовые разделы у сайтов БЦ (не сайтов-поставщиков — отсюда свой список
// путей, не тот, что в process-supplier-enrichment-jobs.mjs): о проекте,
// аренда, характеристики, инфраструктура, контакты. Пробуем и ru-, и en-пути.
const CANDIDATE_PATHS = [
  '',
  '/o-nas', '/o-proekte', '/o-kompanii', '/about',
  '/arenda', '/rent', '/rent-office', '/uslugi',
  '/harakteristiki', '/characteristics', '/tehnicheskie-harakteristiki',
  '/infrastruktura', '/infrastructure',
  '/kontakty', '/contacts',
];
const LINK_KEYWORDS_RE =
  /href\s*=\s*["']([^"'\s>]*(?:o-nas|o-proekte|o-kompanii|about|arend|rent|uslug|harakter|infrastruktur|kontakt|contact)[^"'\s>]*)["']/gi;

function fetchPageOnce(url, { insecure, redirectsLeft = 3 }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === 'http:' ? http : https;
    const req = client.get(
      target,
      {
        headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'ru-RU,ru;q=0.9' },
        timeout: PAGE_FETCH_TIMEOUT_MS,
        ...(insecure && target.protocol === 'https:' ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          resolve(fetchPageOnce(new URL(res.headers.location, target).toString(), { insecure, redirectsLeft: redirectsLeft - 1 }));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let size = 0;
        let settled = false;
        const chunks = [];
        res.on('data', (chunk) => {
          if (settled) return;
          size += chunk.length;
          if (size > MAX_PAGE_BYTES) {
            // res.destroy() не гарантирует событие 'end' — без немедленного
            // resolve() здесь промис зависал бы навсегда (реальный баг: на
            // futuris-bc.by именно так упал первый прогон, Node сообщил
            // "unsettled top-level await" и завершился с кодом 13, потому что
            // ничего больше не держало event loop). Отдаём то, что успели
            // скачать, а не теряем страницу целиком.
            settled = true;
            resolve(Buffer.concat(chunks).toString('utf8'));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (!settled) resolve(Buffer.concat(chunks).toString('utf8'));
        });
        res.on('error', (err) => {
          if (!settled) reject(err);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function fetchPage(url) {
  try {
    return { html: await fetchPageOnce(url, { insecure: false }), insecure: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const certProblem = /certificate|CERT_|SELF_SIGNED|ALT_NAME|SSL|TLS/i.test(message) || /^(ERR_TLS|UNABLE_TO_VERIFY)/i.test(err?.code ?? '');
    if (!certProblem) throw err;
    return { html: await fetchPageOnce(url, { insecure: true }), insecure: true };
  }
}

function htmlToText(html) {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»')
    .replace(/\n\s*\n+/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  return text;
}

async function fetchSiteSnapshot(name, websiteUrl) {
  const base = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
  const pages = []; // { url, text }
  const seen = new Set();
  let insecureUsed = false;
  // Нормализация конечного слэша для дедупа — иначе "https://x" и
  // "https://x/" съедают два разных слота MAX_PAGES_PER_SITE под одну и ту
  // же главную страницу (типовой случай: домашняя ссылка встречается в меню
  // одновременно и как "/", и как голый домен).
  const normalize = (u) => u.replace(/\/$/, '');

  const tryFetch = async (url) => {
    const key = normalize(url);
    if (seen.has(key) || pages.length >= MAX_PAGES_PER_SITE) return;
    seen.add(key);
    try {
      const { html, insecure } = await fetchPage(url);
      insecureUsed = insecureUsed || insecure;
      const text = htmlToText(html);
      if (text.length > 100) pages.push({ url, text });
      return html;
    } catch {
      return null;
    }
  };

  const homepageHtml = await tryFetch(base);
  const linkUrls = new Set();
  if (homepageHtml) {
    for (const m of homepageHtml.matchAll(LINK_KEYWORDS_RE)) {
      try {
        linkUrls.add(new URL(m[1], base).toString());
      } catch {
        // мусорный href
      }
    }
  }
  for (const path of CANDIDATE_PATHS) {
    try {
      linkUrls.add(new URL(path, base).toString());
    } catch {
      // некорректный website в базе
    }
  }
  for (const url of linkUrls) {
    if (pages.length >= MAX_PAGES_PER_SITE) break;
    await tryFetch(url);
  }

  if (pages.length === 0) {
    throw new Error('ни одна страница не открылась (таймаут/HTTP-ошибка/бот-защита)');
  }

  let combined = pages
    .map(({ url, text }) => `=== ${url} ===\n${text}`)
    .join('\n\n');
  if (combined.length > MAX_TOTAL_TEXT_CHARS) {
    combined = `${combined.slice(0, MAX_TOTAL_TEXT_CHARS)}\n… (обрезано по лимиту ${MAX_TOTAL_TEXT_CHARS} символов)`;
  }
  return { text: combined, pageCount: pages.length, insecureUsed };
}

async function runPool(items, limit, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function saveResult(slug, patch) {
  if (DRY_RUN) return;
  const { error } = await supabase.from('business_centers').update(patch).eq('slug', slug);
  if (error) console.error(`  → не удалось сохранить снимок для ${slug}:`, error.message);
}

async function processCenter(center) {
  const label = `${center.name} (${center.slug})`;
  console.log(`Скачиваю: ${label} — ${center.website}`);
  try {
    const { text, pageCount, insecureUsed } = await fetchSiteSnapshot(center.name, center.website);
    console.log(`  → ${pageCount} стр., ${text.length} симв.${insecureUsed ? ' (сертификат сайта невалиден)' : ''}`);
    await saveResult(center.slug, {
      official_site_snapshot_text: text,
      official_site_snapshot_at: new Date().toISOString(),
      official_site_snapshot_error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  → ошибка: ${message}`);
    await saveResult(center.slug, {
      official_site_snapshot_error: message,
      official_site_snapshot_at: new Date().toISOString(),
    });
  }
}

async function main() {
  if (TEST_URL) {
    console.log(`Тестовый запуск на одном сайте (${TEST_URL}), в базу не пишу.`);
    const { text, pageCount } = await fetchSiteSnapshot('Тест', TEST_URL);
    console.log(`--- ${pageCount} стр., ${text.length} симв. ---\n${text.slice(0, 3000)}`);
    return;
  }

  let query = supabase.from('business_centers').select('slug, name, website, official_site_snapshot_at').not('website', 'is', null);
  if (ONLY_SLUG) query = query.eq('slug', ONLY_SLUG);
  const { data: centers, error } = await query;
  if (error) {
    console.error('Не удалось прочитать business_centers:', error.message);
    process.exit(1);
  }
  let targets = FORCE || ONLY_SLUG ? centers : centers.filter((c) => !c.official_site_snapshot_at);
  if (targets.length === 0) {
    console.log('Нечего скачивать — у всех БЦ с сайтом снимок уже есть (используй --force для перескачивания).');
    return;
  }
  if (LIMIT) targets = targets.slice(0, LIMIT);
  console.log(`К обработке: ${targets.length} из ${centers.length} БЦ с сайтом${LIMIT ? ` (лимит --limit=${LIMIT})` : ''}.`);
  await runPool(targets, 5, processCenter);
  console.log('Готово.');
}

// Один плохо ведущий себя сайт не должен обрушивать прогон по остальным 60+ —
// ловим сюрпризы, которые не предусмотрели в fetchPageOnce/processCenter,
// логируем и продолжаем (реальный прецедент такого сюрприза — комментарий
// у res.on('data', ...) выше).
process.on('unhandledRejection', (err) => {
  console.error('Необработанный отказ промиса (сайт пропущен):', err instanceof Error ? err.message : err);
});

await main();
