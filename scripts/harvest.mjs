#!/usr/bin/env node
/*
 * Робот съёма: открывает сайты поставщиков из очереди верификации в
 * headless-браузере и снимает то же самое, что человек снимает двумя
 * закладками, — дерево разделов каталога и контакты.
 *
 * Владелец, 2026-09-14: «наша задача — открыть вкладку и нажать 2 ссылки.
 * Зачем нам вообще Светлана? Почему это нельзя сделать автоматически?»
 *
 * Почему на ЕГО машине, а не на сервере:
 *   - сессия-помощник ходит только в свои домены (Supabase, Vercel, Resend,
 *     GitHub), на сайт поставщика ей хода нет;
 *   - серверный обход (supplier_site_snapshots) качает голый HTML без
 *     JavaScript — из-за этого у 77volt.ru и aviastal.ru было 0 разделов;
 *   - с дата-центровых адресов часть сайтов отдаёт капчу (169.ru) или
 *     заглушку. Домашний адрес и настоящий Chrome этого лишены.
 *
 * Код съёма НЕ дублируется: скрипт выполняет ровно те же файлы закладок
 * (tools/menu-bookmarklet/*.min.js), только поднимает флаг
 * window.__redevHarvest, и вместо отправки в админку они кладут результат в
 * переменную. Значит результат робота и результат Светланы совпадают по
 * определению, а не «примерно».
 *
 * Запуск (Mac, нужен установленный Google Chrome):
 *   node scripts/harvest.mjs --limit=50          — пробный прогон на 50 сайтах
 *   node scripts/harvest.mjs                     — по всей очереди
 *   node scripts/harvest.mjs --country=Беларусь  — только белорусские
 *   node scripts/harvest.mjs --workers=2         — медленнее, но мягче к сайтам
 *   node scripts/harvest.mjs --headful           — показать браузер (посмотреть,
 *                                                  что там происходит)
 *
 * Логин в базу: переменные REDEV_EMAIL и REDEV_PASSWORD, либо скрипт спросит
 * их сам. Это тот же логин, что и в админке; сервисный ключ на машине не
 * нужен и не используется.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
);
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const WORKERS = args.workers ? Math.max(1, Number(args.workers)) : 3;
const COUNTRY = args.country ?? 'Россия';
const HEADFUL = args.headful === 'true';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const menuCode = fs.readFileSync(path.join(root, 'tools/menu-bookmarklet/bookmarklet.min.js'), 'utf8');
const contactsCode = fs.readFileSync(path.join(root, 'tools/menu-bookmarklet/contacts.min.js'), 'utf8');

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

// Повторяет normalizeCapturedPhone из src/lib/menuCaptureReceiver.ts — при
// правке менять В ОБОИХ местах. Номер в базе должен выглядеть одинаково
// независимо от того, кто его снял: робот, закладка или человек руками.
function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  const ru =
    digits.length === 11 && (digits[0] === '7' || digits[0] === '8')
      ? `7${digits.slice(1)}`
      : digits.length === 10
        ? `7${digits}`
        : '';
  if (ru) return `+7 (${ru.slice(1, 4)}) ${ru.slice(4, 7)}-${ru.slice(7, 9)}-${ru.slice(9, 11)}`;
  if (digits.length === 12 && digits.startsWith('375')) {
    return `+375 (${digits.slice(3, 5)}) ${digits.slice(5, 8)}-${digits.slice(8, 10)}-${digits.slice(10, 12)}`;
  }
  if (digits.length === 11 && digits.startsWith('80')) {
    const by = digits.slice(2);
    return `+375 (${by.slice(0, 2)}) ${by.slice(2, 5)}-${by.slice(5, 7)}-${by.slice(7, 9)}`;
  }
  return digits ? `+${digits}` : raw.trim();
}

// Тот же разбор домена, что supplierWebsiteHost на фронте и HOST_SQL в
// скриптах: очередь группируется по домену, а не по карточке.
function hostOf(url) {
  return String(url || '')
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?/i, '')
    .split('/')[0]
    .toLowerCase();
}

async function main() {
  const email = process.env.REDEV_EMAIL || (await ask('Почта админки: '));
  const password = process.env.REDEV_PASSWORD || (await ask('Пароль (будет виден в терминале): '));

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    console.error('Не пускает в базу:', authError.message);
    process.exit(1);
  }

  const { data: offers, error } = await supabase
    .from('supplier_research_offers')
    .select('id, name, website_url, country, verified')
    .eq('verified', false);
  if (error) throw error;

  // Уже снятое пропускаем — прогон можно останавливать и продолжать.
  const { data: doneRows } = await supabase.from('supplier_menu_captures').select('host');
  const done = new Set((doneRows ?? []).map((r) => r.host));

  const queue = [];
  const seen = new Set();
  for (const offer of offers ?? []) {
    const host = hostOf(offer.website_url);
    if (!host || seen.has(host) || done.has(host)) continue;
    if (COUNTRY && offer.country && offer.country !== COUNTRY) continue;
    seen.add(host);
    queue.push({ host, name: offer.name });
  }
  const work = LIMIT === Infinity ? queue : queue.slice(0, LIMIT);
  console.log(`в очереди ${queue.length} сайтов, берём ${work.length}, потоков ${WORKERS}`);
  if (!work.length) return;

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: !HEADFUL });
  } catch (e) {
    console.error('Не нашёлся Google Chrome. Установите его (google.com/chrome) и запустите снова.');
    console.error(String(e.message || e).slice(0, 200));
    process.exit(1);
  }
  const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1440, height: 900 } });
  // Картинки, шрифты и видео не нужны: без них страница открывается заметно
  // быстрее, а разметка, из которой мы всё читаем, не меняется.
  await context.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (type === 'image' || type === 'font' || type === 'media') return route.abort();
    return route.continue();
  });

  const stats = { ok: 0, menuOnly: 0, contactsOnly: 0, empty: 0, failed: 0 };
  let index = 0;

  async function worker() {
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    while (index < work.length) {
      const item = work[index++];
      const no = index;
      let menu = null;
      let contacts = null;
      try {
        await page.goto(`https://${item.host}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
        // Меню и контакты часто дорисовываются скриптом сразу после загрузки.
        await page.waitForTimeout(1500);

        await page.evaluate(() => {
          window.__redevHarvest = true;
          window.__redevHarvestResult = null;
        });
        await page.evaluate(menuCode);
        menu = await page.evaluate(() => window.__redevHarvestResult);

        await page.evaluate(() => {
          window.__redevHarvestResult = null;
        });
        await page.evaluate(contactsCode);
        // Контакты ждут фоновой загрузки страницы «Контакты» — до 6 секунд.
        await page.waitForFunction(() => window.__redevHarvestResult !== null, { timeout: 9000 }).catch(() => {});
        contacts = await page.evaluate(() => window.__redevHarvestResult);
      } catch (e) {
        stats.failed++;
        console.log(`${no}/${work.length} x ${item.host} — ${String(e.message || e).split('\n')[0].slice(0, 60)}`);
        continue;
      }

      const sections = menu && menu.tree ? menu.tree.split('\n').filter((l) => l.trim()).length : 0;
      const found = contacts && Array.isArray(contacts.contacts) ? contacts.contacts : [];

      try {
        if (sections > 0) {
          await supabase.from('supplier_menu_captures').insert({
            host: item.host,
            page_url: menu.pageUrl ?? `https://${item.host}`,
            tree: menu.tree,
            sections_count: sections,
          });
        }
        for (const c of found) {
          if (!c || !c.value) continue;
          const value =
            c.kind === 'phone'
              ? normalizePhone(String(c.value))
              : c.kind === 'email'
                ? String(c.value).toLowerCase()
                : String(c.value);
          await supabase.from('supplier_contact_captures').upsert(
            {
              host: item.host,
              kind: c.kind,
              value,
              messenger_type: c.kind === 'messenger' ? (c.messengerType ?? '') : '',
              raw_text: String(c.rawText ?? '').slice(0, 300),
              page_url: contacts.pageUrl ?? `https://${item.host}`,
              rank: typeof c.rank === 'number' ? c.rank : 0,
              status: 'pending',
            },
            { onConflict: 'host,kind,messenger_type,value' },
          );
        }
      } catch (e) {
        stats.failed++;
        console.log(`${no}/${work.length} x ${item.host} — запись в базу: ${String(e.message || e).slice(0, 60)}`);
        continue;
      }

      if (sections > 0 && found.length > 0) stats.ok++;
      else if (sections > 0) stats.menuOnly++;
      else if (found.length > 0) stats.contactsOnly++;
      else stats.empty++;
      console.log(`${no}/${work.length} + ${item.host} — разделов ${sections}, контактов ${found.length}`);
    }
    await page.close();
  }

  await Promise.all(Array.from({ length: WORKERS }, () => worker()));
  await browser.close();
  console.log('\nитог:', stats);
  console.log('Дальше — в админке: «Закупки» → «Верификация».');
}

await main();
