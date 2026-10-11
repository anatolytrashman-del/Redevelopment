// Обход «трудных» сайтов настоящим браузером (тред «Закупки», 2026-09-28).
// crawl.py ходит curl'ом, и два типа сайтов ему не даются: закрытые проверкой
// «вы не бот» (DDoS-Guard/Cloudflare с JS-задачкой) и те, где меню рисует
// скрипт, — curl видит главную без ссылок внутрь. Здесь то же сырьё, что у
// crawl.py (формат совместим с condense.py), но страницы открывает Chromium.
//
// Запуск: node scripts/supplier-profile/crawl-browser.mjs hosts.tsv OUT_DIR
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [hostsFile, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const MAX_PAGES = 30;
const INFO_RE = /(about|o-?kompan|o-?nas|company|contact|kontakt|proizvod|production|zavod|dealer|diler|partner|dostavk|delivery|price|prais|sertifikat|rekvizit|opt|sotrudnich|sklad)/i;
const CATALOG_RE = /(catalog|katalog|product|produk[ct]|produc|shop|tovar|collection|kollekc|seriya|assortiment|izdeli|model)/i;
const SKIP_RE = /\.(jpg|jpeg|png|gif|webp|svg|pdf|xlsx?|docx?|zip)(\?|$)|\/(cart|basket|korzina|login|auth|personal|compare|search|news|novosti|stati|articles?|blog)(\/|$)|^(mailto|tel|javascript):/i;
const PHONE_RE = /(?:\+7|8)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s-]*\d{2}[\s-]*\d{2}|\+375[\s\-(]*\d{2}[\s\-)]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const INN_RE = /ИНН[\s:№]*(\d{10}|\d{12})/g;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  args: ['--ignore-certificate-errors'],
});
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  locale: 'ru-RU',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
});

const sameSite = (url, host) => {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return h === host || h.endsWith('.' + host);
  } catch {
    return false;
  }
};

async function open(page, url) {
  try {
    const r = await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    // Проверка «вы не бот» проходит сама за несколько секунд и перезагружает страницу.
    await page.waitForTimeout(5000);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const data = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content ?? '',
      text: document.body?.innerText ?? '',
      html: document.documentElement.outerHTML,
      links: [...document.querySelectorAll('a[href]')].map((a) => [a.href, (a.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 150)]),
    }));
    return { status: r?.status() ?? 0, url: page.url(), ...data };
  } catch (e) {
    return { error: String(e).slice(0, 200) };
  }
}

for (const line of fs.readFileSync(hostsFile, 'utf8').split('\n')) {
  const [host, startUrl] = line.split('\t');
  if (!host) continue;
  const res = { host, start_url: startUrl || `https://${host}/`, fetched_at: new Date().toISOString(), error: null, pages: [], product_links: [], files: [], social: [], phones: [], emails: [], inn: [], ogrn: [] };
  const page = await ctx.newPage();
  const home = await open(page, res.start_url);
  if (home.error || !home.text || home.text.length < 200) {
    res.error = home.error || `пусто (${home.status}, ${home.title})`;
  } else {
    const seen = new Set([home.url]);
    const info = [], cat = [], products = new Map();
    let blob = '';
    const absorb = (p, kind) => {
      res.pages.push({ url: p.url, kind, title: p.title, description: p.description, text: p.text.slice(0, 12000) });
      blob += p.html + '\n' + p.text + '\n';
      for (const [u, t] of p.links) {
        if (/\.(pdf|xlsx?|docx?)(\?|$)/i.test(u)) { res.files.push({ url: u, text: t }); continue; }
        if (!sameSite(u, host) || SKIP_RE.test(u)) continue;
        const clean = u.split('#')[0];
        const pth = new URL(clean).pathname;
        if (t && t.length > 3 && pth.split('/').length >= 4 && (CATALOG_RE.test(pth) || kind !== 'home')) products.set(clean, t);
        if (seen.has(clean)) continue;
        seen.add(clean);
        if (INFO_RE.test(pth) || INFO_RE.test(t)) info.push(clean);
        else if (CATALOG_RE.test(pth)) cat.push(clean);
      }
    };
    absorb(home, 'home');
    let fetched = 1;
    const deadline = Date.now() + 240000;
    for (const [kind, queue, cap] of [['info', info, 12], ['catalog', cat, MAX_PAGES]]) {
      for (const u of queue.slice(0, cap)) {
        if (fetched >= MAX_PAGES || Date.now() > deadline) break;
        const p = await open(page, u);
        fetched++;
        if (!p.error && p.text) absorb(p, kind);
      }
    }
    res.product_links = [...products].slice(0, 600).map(([url, text]) => ({ url, text }));
    res.phones = [...new Set((blob.match(PHONE_RE) || []).map((x) => x.replace(/[^\d+]/g, '')))].slice(0, 30);
    res.emails = [...new Set((blob.match(EMAIL_RE) || []).map((x) => x.toLowerCase()).filter((x) => !/\.(png|jpg|gif|webp|svg)$|example|sentry/.test(x)))].slice(0, 30);
    res.inn = [...new Set([...blob.matchAll(INN_RE)].map((m) => m[1]))];
  }
  await page.close();
  fs.writeFileSync(path.join(outDir, `${host}.json`), JSON.stringify(res));
  console.log(host, 'стр=' + res.pages.length, 'тов=' + res.product_links.length, res.error || '');
}
await browser.close();
