/**
 * Проверка гидрации browse-home: ошибка в консоли и тот же DOM-узел
 * main h1 / #catalog-menu-panel до и после JS.
 * ?view=list и карточка — createRoot, идентичность не требуется;
 * проверяем только, что страница открылась и h1 есть.
 *
 *   node scripts/malllist-hydration-check.mjs http://127.0.0.1:4173
 */
import { chromium } from 'playwright-core';

const origin = (process.argv[2] || 'http://127.0.0.1:4173').replace(/\/$/, '');
const HYDRATION = /#418|#423|#425|Hydration failed/;
const cases = [
  { path: '/', identity: true, consent: null },
  { path: '/', identity: true, consent: 'all' },
  { path: '/minsk/tc', identity: true, consent: null },
  { path: '/minsk/tc', identity: true, consent: 'necessary' },
  { path: '/minsk/tc?view=list', identity: false, consent: null },
  { path: '/minsk/tc/4-sezona-bedy', identity: false, consent: null },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  timeout: 15000,
});

const failures = [];
for (const item of cases) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (item.consent) {
    await context.addInitScript((value) => {
      localStorage.setItem('cookie-consent', value);
    }, item.consent);
  }
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      window.__h1 = document.querySelector('main h1');
      window.__menu = document.querySelector('#catalog-menu-panel');
    });
  });
  const page = await context.newPage();
  const logs = [];
  page.on('pageerror', (error) => logs.push(String(error)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(msg.text());
  });
  try {
    await page.goto(origin + item.path, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    const facts = await page.evaluate((needIdentity) => {
      const h1 = document.querySelector('main h1');
      const menu = document.querySelector('#catalog-menu-panel');
      const grid = document.querySelector('[data-catalog-menu-grid]');
      const placeholder = (menu?.textContent || '').includes('Загружаем каталог');
      return {
        h1: h1?.textContent?.trim() ?? null,
        sameH1: needIdentity ? h1 != null && h1 === window.__h1 : true,
        sameMenu: needIdentity ? menu != null && menu === window.__menu : true,
        gridLinks: grid ? grid.querySelectorAll('a[href^="/minsk/tc"]').length : 0,
        placeholder,
      };
    }, item.identity);
    const hydration = logs.filter((line) => HYDRATION.test(line));
    const bad = [];
    if (!facts.h1) bad.push('нет h1');
    if (item.identity && hydration.length) bad.push('hydration ' + hydration[0].slice(0, 160));
    if (item.identity && !facts.sameH1) bad.push('h1 заменён');
    if (item.identity && !facts.sameMenu) bad.push('меню заменено');
    if (item.identity && facts.placeholder) bad.push('плейсхолдер меню');
    if (item.identity && facts.gridLinks < 1) bad.push('нет ссылок сетки');
    console.log(JSON.stringify({ path: item.path, consent: item.consent, facts, bad }));
    if (bad.length) failures.push(`${item.path} consent=${item.consent}: ${bad.join('; ')}`);
  } catch (error) {
    failures.push(`${item.path}: ${error instanceof Error ? error.message : error}`);
  }
  await context.close();
}
await browser.close();
if (failures.length) {
  console.error('[hydration-check] НЕ ПРОЙДЕН');
  for (const line of failures) console.error('  - ' + line);
  process.exit(1);
}
console.log('[hydration-check] пройден');
