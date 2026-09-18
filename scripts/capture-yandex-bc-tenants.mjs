#!/usr/bin/env node
// Локальный полуавтоматический сбор организаций из открытой страницы Яндекс Карт.
// Не обходит CAPTCHA: при проверке пользователь завершает её в открытом Chrome и нажимает Enter.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const has = (name) => args.includes(name);
const inputPath = valueOf('--input');
const archivePath = valueOf('--webarchive');
const onlySlug = valueOf('--slug');
const limit = Number(valueOf('--limit') ?? 0);
const writeDb = has('--write-db');
const listOnly = has('--list');
const outputRoot = path.resolve(valueOf('--output') ?? 'tmp/yandex-bc-tenants');
const profileDir = path.resolve(valueOf('--profile') ?? 'tmp/yandex-maps-profile');
// Половина экрана, а не --start-maximized — чтобы окно Chrome не закрывало
// собой терминал, где нужно нажимать Enter. Подобрано под типичный ноутбучный
// экран (~1512–1728 логических px в ширину); если не подходит под ваш
// монитор — переопределить через CHROME_WINDOW_SIZE="ШxВ" и
// CHROME_WINDOW_POSITION="X,Y" (например CHROME_WINDOW_SIZE=960,1080
// CHROME_WINDOW_POSITION=960,0 для широкого монитора).
const windowSize = process.env.CHROME_WINDOW_SIZE ?? '760,900';
const windowPosition = process.env.CHROME_WINDOW_POSITION ?? '760,0';
const chromeCandidates = process.platform === 'darwin'
  ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
  : process.platform === 'win32'
    ? [
        `${process.env.PROGRAMFILES ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const chromePath = process.env.CHROME_PATH ?? chromeCandidates.find((candidate) => candidate && existsSync(candidate));
const supabaseUrl = process.env.SUPABASE_URL ?? 'https://iohcdylttyuhwovztrbk.supabase.co';
const anonKey = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = 'iohcdylttyuhwovztrbk';

if (archivePath && !onlySlug) {
  console.error('Для импорта архива укажите --slug');
  process.exit(1);
}
if (!archivePath && !chromePath) {
  console.error('Chrome не найден. Укажите полный путь через переменную CHROME_PATH');
  process.exit(1);
}
if (archivePath && process.platform !== 'darwin') {
  console.error('Импорт Apple .webarchive поддерживается только на macOS; живой сбор работает на macOS, Windows и Linux');
  process.exit(1);
}
if (writeDb && !serviceRoleKey && !accessToken) {
  console.error('Для --write-db нужен SUPABASE_SERVICE_ROLE_KEY или SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const decodeHtml = (value) => value
  .replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

function extractFromHtml(html, sourceUrl) {
  const organizations = new Map();
  const titlePattern = /class="search-business-snippet-view__title"[^>]*>(.*?)<\//gs;
  for (const match of html.matchAll(titlePattern)) {
    const name = normalizeText(decodeHtml(match[1].replace(/<[^>]+>/g, '')));
    const before = html.slice(Math.max(0, match.index - 12000), match.index);
    const links = [...before.matchAll(/href="([^"]*\/org\/[^/]+\/(\d+)\/?)"/g)];
    const link = links.at(-1);
    if (!name || !link) continue;
    const id = link[2];
    const url = new URL(decodeHtml(link[1]), sourceUrl).href;
    organizations.set(id, { name, sourceId: id, sourceUrl: url });
  }
  return [...organizations.values()];
}

async function webarchiveHtml(file) {
  const script = 'ObjC.import("Foundation"); const p=$.NSPropertyListSerialization.propertyListWithDataOptionsFormatError($.NSData.dataWithContentsOfFile($.NSString.stringWithUTF8String(ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey("ARCHIVE")))),$.NSPropertyListImmutable,null,null); const d=p.objectForKey("WebMainResource").objectForKey("WebResourceData"); $.NSFileHandle.fileHandleWithStandardOutput.writeData(d);';
  const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script], {
    env: { ...process.env, ARCHIVE: path.resolve(file) }, maxBuffer: 50 * 1024 * 1024, encoding: 'buffer',
  });
  return stdout.toString('utf8');
}

function xmlEscape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function saveWebarchive(file, html, url) {
  if (process.platform !== 'darwin') return false;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>WebMainResource</key><dict><key>WebResourceData</key><data>${Buffer.from(html).toString('base64')}</data><key>WebResourceFrameName</key><string></string><key>WebResourceMIMEType</key><string>text/html</string><key>WebResourceTextEncodingName</key><string>UTF-8</string><key>WebResourceURL</key><string>${xmlEscape(url)}</string></dict></dict></plist>`;
  await fs.writeFile(file, xml);
  await execFileAsync('plutil', ['-convert', 'binary1', file]);
  return true;
}

async function pauseForUser(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(`${message}\nНажмите Enter, когда страница готова… `);
  rl.close();
}

async function collectLive(entry, initialOrganizations, onProgress) {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false, executablePath: chromePath, viewport: null,
    args: [`--window-size=${windowSize}`, `--window-position=${windowPosition}`],
  });
  const page = context.pages()[0] ?? await context.newPage();
  const url = entry.yandexUrl ?? `https://yandex.by/maps/157/minsk/search/${encodeURIComponent(entry.address)}/`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await pauseForUser(`Проверьте адрес «${entry.address}». Если Яндекс показал CAPTCHA, пройдите её. Откройте вкладку «Организации внутри».`);

  const found = new Map(initialOrganizations.map((organization) => [organization.sourceId, organization]));
  let unchanged = 0;
  let previous = 0;
  while (unchanged < 6) {
    // Раньше карточки читались по одной через Playwright-локаторы (два
    // круговых обращения к браузеру на каждую, включая уже известные) —
    // на большом здании (90+ организаций) это заметно накапливалось на
    // каждой итерации скролла. Один page.evaluate() читает все карточки
    // разом внутри браузера — тот же результат, без повторных round-trip.
    const extracted = await page.evaluate(() => [...document.querySelectorAll('.search-business-snippet-view')].map((card) => {
      const titleEl = card.querySelector('.search-business-snippet-view__title');
      const linkEl = card.querySelector('a[href*="/org/"]');
      return [titleEl?.textContent ?? '', linkEl?.getAttribute('href') ?? null];
    }));
    for (const [rawTitle, href] of extracted) {
      const title = normalizeText(rawTitle);
      const id = href?.match(/\/org\/[^/]+\/(\d+)/)?.[1];
      if (title && id) found.set(id, {
        name: title,
        sourceId: id,
        sourceUrl: new URL(href, page.url()).href,
        buildingAddress: entry.address,
        buildingUrl: url,
      });
    }
    unchanged = found.size === previous ? unchanged + 1 : 0;
    if (found.size > previous) await onProgress([...found.values()], page.url());
    previous = found.size;
    await page.locator('.scroll__container').last().evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(1200);
  }
  const html = await page.content();
  const finalUrl = page.url();
  await context.close();
  return { html, finalUrl, organizations: [...found.values()] };
}

async function writeSnapshot(snapshot) {
  const row = {
    business_center_slug: snapshot.slug,
    source: 'yandex_maps',
    source_url: snapshot.sourceUrl,
    address_query: snapshot.address,
    organizations: snapshot.organizations,
    organization_count: snapshot.organizations.length,
    captured_at: snapshot.capturedAt,
  };
  if (serviceRoleKey) {
    const client = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await client.from('business_center_tenant_source_snapshots').upsert(row, { onConflict: 'business_center_slug,source' });
    if (error) throw error;
    return;
  }
  const literal = (v) => `'${String(v).replaceAll("'", "''")}'`;
  const sql = `insert into public.business_center_tenant_source_snapshots (business_center_slug,source,source_url,address_query,organizations,organization_count,captured_at) values (${literal(row.business_center_slug)},'yandex_maps',${literal(row.source_url)},${literal(row.address_query)},${literal(JSON.stringify(row.organizations))}::jsonb,${row.organization_count},${literal(row.captured_at)}::timestamptz) on conflict (business_center_slug,source) do update set source_url=excluded.source_url,address_query=excluded.address_query,organizations=excluded.organizations,organization_count=excluded.organization_count,captured_at=excluded.captured_at;`;
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) throw new Error(`Supabase Management API ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

await fs.mkdir(outputRoot, { recursive: true });

async function saveCheckpoint(entry, organizations, sourceUrl, capturedAt) {
  const dir = path.join(outputRoot, entry.slug);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, 'latest.json');
  const temporary = `${target}.tmp`;
  const snapshot = { ...entry, sourceUrl, capturedAt, complete: false, organizations };
  await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2));
  await fs.rename(temporary, target);
  if (writeDb) {
    await writeSnapshot({
      slug: entry.slug,
      address: entry.address ?? '',
      sourceUrl,
      capturedAt,
      organizations,
    });
  }
  console.log(`${entry.slug}: контрольная точка — ${organizations.length} организаций`);
}

async function readCheckpoint(slug) {
  try {
    const raw = await fs.readFile(path.join(outputRoot, slug, 'latest.json'), 'utf8');
    const snapshot = JSON.parse(raw);
    return Array.isArray(snapshot.organizations) ? snapshot.organizations : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function catalogEntries() {
  const client = createClient(supabaseUrl, anonKey);
  let centersQuery = client
    .from('business_centers')
    .select('slug,name,address,status,sort_order')
    .eq('status', 'built')
    .order('sort_order', { ascending: true });
  if (onlySlug) centersQuery = centersQuery.eq('slug', onlySlug);
  if (limit > 0) centersQuery = centersQuery.limit(limit);
  const { data: centers, error: centersError } = await centersQuery;
  if (centersError) throw centersError;

  const slugs = (centers ?? []).map((center) => center.slug);
  let buildingPages = [];
  if (slugs.length > 0) {
    const { data, error } = await client
      .from('business_center_yandex_buildings')
      .select('business_center_slug,address,yandex_url,sort_order')
      .in('business_center_slug', slugs)
      .order('sort_order', { ascending: true });
    // До применения миграции PostgREST вернёт 42P01. Обычные однокорпусные
    // здания всё равно можно собрать по адресу из business_centers.
    if (!error) buildingPages = data ?? [];
    else if (error.code !== '42P01' && error.code !== 'PGRST205') throw error;
  }

  return (centers ?? []).map((center) => {
    const buildings = buildingPages
      .filter((building) => building.business_center_slug === center.slug)
      .map((building) => ({ address: building.address, yandexUrl: building.yandex_url }));
    return {
      slug: center.slug,
      name: center.name,
      address: center.address,
      buildings: buildings.length > 0 ? buildings : [{ address: center.address }],
    };
  });
}

let entries;
if (archivePath) entries = [{ slug: onlySlug, address: '', archivePath }];
else if (inputPath) {
  entries = JSON.parse(await fs.readFile(path.resolve(inputPath), 'utf8'));
  if (onlySlug) entries = entries.filter((entry) => entry.slug === onlySlug);
  if (limit > 0) entries = entries.slice(0, limit);
} else entries = await catalogEntries();

if (entries.length === 0) throw new Error('Не найдено ни одного БЦ для обработки');
if (listOnly) {
  console.log(JSON.stringify(entries, null, 2));
  process.exit(0);
}

for (const entry of entries) {
  if (!entry.slug) throw new Error('У записи нет slug');
  const capturedAt = new Date().toISOString();
  let sourceUrl, organizations;
  if (entry.archivePath) {
    const html = await webarchiveHtml(entry.archivePath);
    sourceUrl = html.match(/<base[^>]+href="([^"]+)"/)?.[1] ?? 'https://yandex.by/maps/';
    organizations = extractFromHtml(html, sourceUrl);
    await saveCheckpoint(entry, organizations, sourceUrl, capturedAt);
    const dir = path.join(outputRoot, entry.slug);
    const stamp = capturedAt.replaceAll(':', '-');
    await fs.writeFile(path.join(dir, `${stamp}.html`), html);
    await saveWebarchive(path.join(dir, `${stamp}.webarchive`), html, sourceUrl);
  } else {
    const buildings = Array.isArray(entry.buildings) && entry.buildings.length > 0
      ? entry.buildings
      : [{ address: entry.address, yandexUrl: entry.yandexUrl }];
    organizations = await readCheckpoint(entry.slug);
    for (let index = 0; index < buildings.length; index += 1) {
      const building = { ...entry, ...buildings[index], buildings: undefined };
      const result = await collectLive(
        building,
        organizations,
        (currentOrganizations, currentUrl) => saveCheckpoint(entry, currentOrganizations, currentUrl, capturedAt),
      );
      organizations = result.organizations;
      sourceUrl = result.finalUrl;
      const dir = path.join(outputRoot, entry.slug);
      const stamp = capturedAt.replaceAll(':', '-');
      const suffix = buildings.length > 1 ? `-building-${index + 1}` : '';
      await fs.writeFile(path.join(dir, `${stamp}${suffix}.html`), result.html);
      await saveWebarchive(path.join(dir, `${stamp}${suffix}.webarchive`), result.html, sourceUrl);
    }
  }
  const dir = path.join(outputRoot, entry.slug);
  await fs.mkdir(dir, { recursive: true });
  const stamp = capturedAt.replaceAll(':', '-');
  const completed = { ...entry, sourceUrl, capturedAt, complete: true, organizations };
  await fs.writeFile(path.join(dir, `${stamp}.json`), JSON.stringify(completed, null, 2));
  await fs.writeFile(path.join(dir, 'latest.json.tmp'), JSON.stringify(completed, null, 2));
  await fs.rename(path.join(dir, 'latest.json.tmp'), path.join(dir, 'latest.json'));
  console.log(`${entry.slug}: сохранено ${organizations.length} организаций`);
}
