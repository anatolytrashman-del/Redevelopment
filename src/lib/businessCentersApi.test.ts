import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BusinessCenterRow } from '../data/businessCenters';

// Данные раздела БЦ из сборки (Ш3-b плана docs/bc-catalog-seo-plan.md):
// инлайн-скрипт index.html кладёт промисы в window, businessCentersApi
// разбирает их до монтирования. Здесь проверяется то, что собирается и
// падает тихо: снимок обязан протухать по часам, а не по флагу, а
// неудавшийся файл здания — не «здания нет», а «спроси базу».

// Supabase в этих тестах — заглушка со счётчиком: важно не что вернула
// база, а ходили ли в неё вообще.
const from = vi.fn();
vi.mock('./supabase', () => ({ supabase: { from } }));
vi.mock('./publicRebuild', () => ({ triggerPublicRebuild: vi.fn() }));

function dbRows(rows: unknown[]) {
  const result = { data: rows, error: null };
  const chain = {
    select: () => chain,
    order: () => Promise.resolve(result),
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
  };
  from.mockReturnValue(chain);
}

const row = (slug: string): BusinessCenterRow =>
  ({ id: slug, slug, name: slug, sort_order: 1, created_at: '2026-01-01T00:00:00Z' }) as unknown as BusinessCenterRow;

interface BuildWindow {
  __bcList?: Promise<{ generatedAt: string; rows: BusinessCenterRow[] } | null>;
  __bcDetail?: { slug: string; data: Promise<{ generatedAt: string; row: BusinessCenterRow } | null> };
}

// Модуль держит снимок в своих переменных — каждый тест поднимает свежую
// копию, чтобы снимок предыдущего не просачивался.
async function loadApi() {
  vi.resetModules();
  return import('./businessCentersApi');
}

const NOW = new Date('2026-09-22T12:00:00Z');
const win = (): BuildWindow => (globalThis as unknown as { window: BuildWindow }).window;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  (globalThis as unknown as { window: BuildWindow }).window = {};
  from.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { window?: BuildWindow }).window;
});

describe('снимок из сборки', () => {
  it('свежий список отдаётся без похода в базу, и страницы получают его синхронно', async () => {
    win().__bcList = Promise.resolve({ generatedAt: NOW.toISOString(), rows: [row('a'), row('b')] });
    const api = await loadApi();
    await api.primeBusinessCentersFromBuild();
    expect(api.snapshotBusinessCenters()?.map((c) => c.slug)).toEqual(['a', 'b']);
    dbRows([row('db')]);
    expect((await api.fetchBusinessCenters()).map((c) => c.slug)).toEqual(['a', 'b']);
    expect(from).not.toHaveBeenCalled();
  });

  it('свежесть считается при каждом обращении: в долгой вкладке снимок протухает', async () => {
    win().__bcList = Promise.resolve({ generatedAt: NOW.toISOString(), rows: [row('a')] });
    const api = await loadApi();
    await api.primeBusinessCentersFromBuild();
    dbRows([row('db')]);
    expect((await api.fetchBusinessCenters()).map((c) => c.slug)).toEqual(['a']);
    vi.setSystemTime(new Date(NOW.getTime() + 61 * 60 * 1000));
    expect((await api.fetchBusinessCenters()).map((c) => c.slug)).toEqual(['db']);
    // Для первого рендера старый снимок всё ещё годится — это те же данные,
    // что стоят в пререндер-разметке.
    expect(api.snapshotBusinessCenters()?.map((c) => c.slug)).toEqual(['a']);
  });

  it('старый снимок (сборки давно не было) не отменяет запрос в базу', async () => {
    const stale = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();
    win().__bcList = Promise.resolve({ generatedAt: stale, rows: [row('a')] });
    const api = await loadApi();
    await api.primeBusinessCentersFromBuild();
    dbRows([row('db')]);
    expect((await api.fetchBusinessCenters()).map((c) => c.slug)).toEqual(['db']);
  });

  it('файл здания, который не пришёл, — «не знаем», а не «здания нет»: идём в базу', async () => {
    win().__bcList = Promise.resolve({ generatedAt: NOW.toISOString(), rows: [row('a')] });
    win().__bcDetail = { slug: 'novyy', data: Promise.resolve(null) };
    const api = await loadApi();
    await api.primeBusinessCentersFromBuild();
    expect(api.snapshotBusinessCenter('novyy')).toBeNull();
    dbRows([row('novyy')]);
    expect((await api.fetchBusinessCenter('novyy'))?.slug).toBe('novyy');
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('пришедший файл здания отдаётся по слагу из самого ряда, без базы', async () => {
    win().__bcDetail = { slug: 'port-2', data: Promise.resolve({ generatedAt: NOW.toISOString(), row: row('port-2') }) };
    const api = await loadApi();
    await api.primeBusinessCentersFromBuild();
    expect(api.snapshotBusinessCenter('port-2')?.slug).toBe('port-2');
    expect(api.snapshotBusinessCenter('port')).toBeNull();
    expect((await api.fetchBusinessCenter('port-2'))?.slug).toBe('port-2');
    expect(from).not.toHaveBeenCalled();
  });

  it('битый файл списка не ломает разбор: страница уходит в базу, как раньше', async () => {
    win().__bcList = Promise.resolve({ generatedAt: NOW.toISOString(), rows: 'мусор' as unknown as BusinessCenterRow[] });
    const api = await loadApi();
    await api.primeBusinessCentersFromBuild();
    expect(api.snapshotBusinessCenters()).toBeNull();
    dbRows([row('db')]);
    expect((await api.fetchBusinessCenters()).map((c) => c.slug)).toEqual(['db']);
  });

  it('вне раздела (нет промисов в window) не заводит таймаут и не ждёт', async () => {
    const api = await loadApi();
    // Таймеры фейковые и не тикают: дошли бы до setTimeout — await повис бы.
    await api.primeBusinessCentersFromBuild();
    expect(vi.getTimerCount()).toBe(0);
    expect(api.snapshotBusinessCenters()).toBeNull();
  });
});

// Список односегментных разделов каталога в инлайн-скрипте index.html и
// такие же маршруты в App.tsx — файлы-близнецы (см. CLAUDE.md): новый
// раздел /minsk/bcminsk/<слово> без записи в index.html будет принят за
// слаг здания, и страница сходит за /data/bc/<слово>.json, которого нет.
describe('разделы каталога в index.html ↔ маршруты App.tsx', () => {
  it('списки совпадают', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const sectionsBlock = html.match(/var sections = \[([^\]]*)\]/);
    expect(sectionsBlock, 'в index.html не найден список sections').not.toBeNull();
    const fromHtml = [...sectionsBlock![1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort();
    const fromRoutes = [...app.matchAll(/<Route path="\/minsk\/bcminsk\/([a-z0-9-]+)"/g)].map((m) => m[1]).sort();
    expect(fromRoutes.length).toBeGreaterThan(0);
    expect(fromHtml).toEqual(fromRoutes);
  });
});
