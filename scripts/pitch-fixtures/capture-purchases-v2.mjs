/**
 * Targeted live shots: paint + ceramic tile comparisons, letters, catalog.
 * Password via CAPTURE_PASSWORD only.
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '/tmp/procurement-shots';
const ART = '/opt/cursor/artifacts/procurement-pitch';
const DOCS = 'docs/assets/procurement-pitch';
const PASSWORD = process.env.CAPTURE_PASSWORD;
if (!PASSWORD) {
  console.error('Set CAPTURE_PASSWORD');
  process.exit(1);
}
for (const d of [OUT, ART, DOCS]) mkdirSync(d, { recursive: true });

async function save(page, name, clip) {
  const path = join(OUT, name);
  await page.screenshot({ path, clip, type: 'png' });
  copyFileSync(path, join(ART, name));
  copyFileSync(path, join(DOCS, name));
  console.log('saved', name, clip);
}

async function saveLocator(page, name, locator, opts = {}) {
  const { padX = 20, padY = 16, maxH = 520, extraBottom = 80 } = opts;
  const el = locator.first();
  await el.waitFor({ state: 'visible', timeout: 25000 });
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  const box = await el.boundingBox();
  if (!box) throw new Error('no box ' + name);
  const vp = page.viewportSize();
  const x = Math.max(0, Math.floor(box.x - padX));
  const y = Math.max(0, Math.floor(box.y - padY));
  const width = Math.min(vp.width - x, Math.ceil(box.width + padX * 2));
  const height = Math.min(maxH, Math.ceil(box.height + padY + extraBottom), vp.height - y);
  await save(page, name, { x, y, width, height });
}

async function login(page) {
  await page.goto('https://redevelopment.pro/admin/purchases', { waitUntil: 'networkidle', timeout: 90000 });
  const account = page.getByRole('button', { name: 'Трэшмен' });
  if (await account.count()) await account.click();
  else await page.getByText('Трэшмен', { exact: true }).click();
  const pwd = page.locator('input[type="password"]');
  await pwd.waitFor({ state: 'visible', timeout: 20000 });
  await pwd.fill(PASSWORD);
  const enter = page.getByRole('button', { name: /войти|вход|продолжить/i });
  if (await enter.count()) await enter.click();
  else await pwd.press('Enter');
  await page.getByRole('heading', { name: 'Закупки' }).waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(1200);
}

async function openCategory(page, labelRe) {
  // Category selector on comparison tab — click the big dropdown/card
  const selector = page.locator('button, [role="button"], div').filter({ hasText: labelRe }).first();
  // First open the category picker if current category is wrong
  const current = page.locator('text=/Выбор:/').first();
  if (await current.count()) {
    const text = await current.innerText().catch(() => '');
    if (!labelRe.test(text)) {
      // click the category header card
      await current.click();
      await page.waitForTimeout(500);
      const option = page.getByText(labelRe).first();
      if (await option.count()) {
        await option.click();
        await page.waitForTimeout(1500);
      }
    }
  } else if (await selector.count()) {
    await selector.click();
    await page.waitForTimeout(800);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  await login(page);

  // —— Header zoom (tighter, with CTA buttons fully in frame)
  await save(page, '01-header-cta.png', { x: 260, y: 8, width: 1160, height: 200 });

  // —— Request prices: full modal
  await page.getByRole('button', { name: 'Запросить цены' }).click();
  await page.waitForTimeout(900);
  const dialog = page.locator('[role="dialog"]').first();
  if (await dialog.count()) {
    await saveLocator(page, '02-request-modal.png', dialog, { padX: 28, padY: 24, maxH: 640, extraBottom: 24 });
  } else {
    await save(page, '02-request-modal.png', { x: 280, y: 40, width: 880, height: 620 });
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // —— Letters: open paint thread «Краски Здесь»
  const paintThread = page.getByText(/Краски Здесь|Imagine Colors|Краски, обои/i).first();
  if (await paintThread.count()) {
    await paintThread.click();
    await page.waitForTimeout(1200);
    await save(page, '04-letters-paint.png', { x: 260, y: 90, width: 1140, height: 520 });
  }

  // Open ceramic thread Подноги
  const tileThread = page.getByText(/Подноги|Керамогранит/i).first();
  if (await tileThread.count()) {
    await tileThread.click();
    await page.waitForTimeout(1200);
    await save(page, '04-letters-tile.png', { x: 260, y: 90, width: 1140, height: 520 });
  }

  // —— Auto-replies modal
  await page.getByRole('button', { name: 'Автоответы' }).click().catch(() => {});
  await page.waitForTimeout(800);
  if (await page.locator('[role="dialog"]').count()) {
    await saveLocator(page, '04-autoreplies.png', page.locator('[role="dialog"]').first(), {
      padX: 24,
      padY: 20,
      maxH: 600,
      extraBottom: 20,
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // —— Comparison: navigate and pick ceramic / paint
  await page.goto('https://redevelopment.pro/admin/purchases?tab=comparison', {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await page.waitForTimeout(2000);

  // Dump available category labels for debugging
  const cats = await page.locator('text=/Выбор:/').allInnerTexts().catch(() => []);
  console.log('category headers:', cats);

  // Try opening category dropdown — look for chevron card
  const catCard = page.locator('button, [role="button"]').filter({ hasText: /Выбор:/ }).first();
  if (await catCard.count()) {
    await catCard.click();
    await page.waitForTimeout(600);
    // list options in dropdown/menu
    const menuItems = page.locator('[role="option"], [role="menuitem"], button, a, li').filter({
      hasText: /Керамогранит|Краски|плинтус|Потолк/i,
    });
    const n = await menuItems.count();
    console.log('menu-like items', n);
    for (let i = 0; i < Math.min(n, 12); i++) {
      console.log(' -', (await menuItems.nth(i).innerText()).replace(/\s+/g, ' ').slice(0, 80));
    }

    // Ceramic
    const ceramic = page.getByText(/Керамогранит и плитка/i).first();
    if (await ceramic.count()) {
      await ceramic.click();
      await page.waitForTimeout(1800);
      await save(page, '03-compare-ceramic.png', { x: 260, y: 70, width: 1140, height: 560 });
      // deeper crop on table/body
      const body = page.locator('main').first();
      await save(page, '03-compare-ceramic-body.png', { x: 280, y: 220, width: 1100, height: 480 });
    }

    // reopen for paint
    if (await catCard.count()) {
      await catCard.click().catch(async () => {
        await page.locator('text=/Выбор:/').first().click();
      });
      await page.waitForTimeout(500);
    } else {
      await page.locator('text=/Выбор:/').first().click();
      await page.waitForTimeout(500);
    }
    const paint = page.getByText(/Краски, обои|декоративные покрытия|Краски/i).first();
    if (await paint.count()) {
      await paint.click();
      await page.waitForTimeout(1800);
      await save(page, '03-compare-paint.png', { x: 260, y: 70, width: 1140, height: 560 });
      await save(page, '03-compare-paint-body.png', { x: 280, y: 220, width: 1100, height: 480 });
    }
  } else {
    // fallback: just shoot current comparison
    await save(page, '03-compare-fallback.png', { x: 260, y: 70, width: 1140, height: 560 });
  }

  // —— Catalog
  await page.goto('https://redevelopment.pro/admin/purchases?tab=suppliers', {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await page.waitForTimeout(1800);
  await save(page, '05-catalog.png', { x: 260, y: 80, width: 1140, height: 480 });
  // zoom a hub if present
  const hub = page.getByText(/Полы, плитка|Отделка|Потолки/i).first();
  if (await hub.count()) {
    await hub.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    const box = await hub.boundingBox();
    if (box) {
      await save(page, '05-catalog-hub.png', {
        x: Math.max(0, box.x - 40),
        y: Math.max(0, box.y - 20),
        width: 900,
        height: 360,
      });
    }
  }

  // —— Ledger
  await page.goto('https://redevelopment.pro/admin/purchases?tab=ledger', {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await page.waitForTimeout(1500);
  await save(page, '06-ledger.png', { x: 260, y: 80, width: 1140, height: 420 });

  // —— Orders
  await page.goto('https://redevelopment.pro/admin/purchases?tab=orders', {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await page.waitForTimeout(1500);
  await save(page, '07-orders.png', { x: 260, y: 80, width: 1140, height: 420 });

  await browser.close();
  console.log('done v2');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
