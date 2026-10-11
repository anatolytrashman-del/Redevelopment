// Фирменные ассеты officelist в dist/: фавикон (красная O) и запасной og-image.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { DEPLOYED_SITE_MODE, OFFICES_ORIGIN } from './domainSplit.mjs';

if (DEPLOYED_SITE_MODE !== 'offices') process.exit(0);

const DIST_DIR = 'dist';
const PUBLIC_OFFICES = 'public/offices';
const RED = '#e4152b';

if (!existsSync(DIST_DIR)) {
  throw new Error('[prepare-offices-brand] нет dist/ — запускать после vite build');
}

const svgSrc = join(PUBLIC_OFFICES, 'favicon.svg');
if (!existsSync(svgSrc)) {
  throw new Error('[prepare-offices-brand] нет public/offices/favicon.svg');
}
copyFileSync(svgSrc, join(DIST_DIR, 'favicon.svg'));

async function chromiumLaunch() {
  const localPw = '/opt/pw-browsers/chromium';
  if (!process.env.VERCEL && existsSync(localPw)) {
    return chromium.launch({ executablePath: localPw, headless: true });
  }
  const sparticuzChromium = (await import('@sparticuz/chromium')).default;
  return chromium.launch({
    executablePath: await sparticuzChromium.executablePath(),
    args: sparticuzChromium.args.filter((a) => a !== '--single-process'),
    headless: true,
  });
}

function faviconHtml(size) {
  const svg = readFileSync(svgSrc, 'utf8');
  return `<!doctype html><html><head><style>
html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}
svg{display:block;width:${size}px;height:${size}px}
</style></head><body>${svg}</body></html>`;
}

function defaultOgHtml() {
  return `<!doctype html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif}
.card{width:1200px;height:630px;background:${RED};color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:66px 84px}
.top{display:flex;align-items:center;gap:22px}
.mark{font-weight:900;font-size:62px;line-height:1}
.site{font-weight:700;font-size:27px;opacity:.85}
.title{font-weight:700;font-size:72px;line-height:1.14;letter-spacing:-0.005em}
.kicker{font-weight:500;font-size:29px;opacity:.85}
</style></head><body><div class="card">
<div class="top"><span class="mark">O</span><span class="site">officelist.pro</span></div>
<div class="title">Каталог бизнес-центров</div>
<div class="kicker">OfficeList · полный список БЦ Минска</div>
</div></body></html>`;
}

async function main() {
  let browser;
  try {
    browser = await chromiumLaunch();
    const page = await browser.newPage();

    await page.setViewportSize({ width: 32, height: 32 });
    await page.setContent(faviconHtml(32), { waitUntil: 'load' });
    await page.screenshot({ path: join(DIST_DIR, 'favicon.png'), omitBackground: true });

    await page.setViewportSize({ width: 180, height: 180 });
    await page.setContent(faviconHtml(180), { waitUntil: 'load' });
    await page.screenshot({ path: join(DIST_DIR, 'apple-touch-icon.png') });

    copyFileSync(join(DIST_DIR, 'favicon.png'), join(DIST_DIR, 'favicon.ico'));

    mkdirSync(join(DIST_DIR, 'og'), { recursive: true });
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(defaultOgHtml(), { waitUntil: 'load' });
    await page.screenshot({ path: join(DIST_DIR, 'og-image.png') });
    copyFileSync(join(DIST_DIR, 'og-image.png'), join(DIST_DIR, 'og', 'home.png'));

    console.log(`[prepare-offices-brand] фавикон O + og-image → dist/ (${OFFICES_ORIGIN})`);
  } catch (err) {
    console.warn(
      '[prepare-offices-brand] не удалось отрисовать PNG (оставляю SVG):',
      err instanceof Error ? err.message : err,
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}

main();
