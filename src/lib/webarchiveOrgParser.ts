import { parseBplist } from './bplist';
import type { ParsedBusinessEntry } from './districtBusinessPointsApi';

// Разбор .webarchive-выгрузки карточки дома с Яндекс.Карт (владелец прислал
// реальный пример через Cmd+S в Safari, см. журнал CLAUDE.md, 2026-08-26 —
// предполагавшийся простой .txt оказался не тем, чем Светлана реально
// пользуется). Внутри — binary plist (см. lib/bplist.ts), WebMainResource.
// WebResourceData — это HTML-снимок страницы В МОМЕНТ СОХРАНЕНИЯ (Safari
// сериализует уже отрисованный DOM, не исходный SPA-шелл), поэтому весь
// список организаций уже там как обычная разметка. Разобрано на реальном
// файле владельца (Аэродромная, 32) — каждая организация лежит в
// .search-business-snippet-view, часть карточек (замечено — первые 2-3)
// дублируются вторым блоком на странице (какой-то "похожие"/pinned виджет
// с тем же компонентом) — дедуп по числовому id организации из ссылки на
// её карточку (/maps/org/.../<id>/...).
export function parseWebarchiveOrgList(buffer: ArrayBuffer): ParsedBusinessEntry[] {
  const root = parseBplist(buffer) as { WebMainResource?: { WebResourceData?: Uint8Array } };
  const htmlBytes = root?.WebMainResource?.WebResourceData;
  if (!htmlBytes) throw new Error('В файле не нашлось WebMainResource — это точно .webarchive от Safari?');

  const html = new TextDecoder('utf-8').decode(htmlBytes);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cards = doc.querySelectorAll('.search-business-snippet-view');

  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const entries: ParsedBusinessEntry[] = [];

  for (const card of cards) {
    const titleEl = card.querySelector('.search-business-snippet-view__title');
    const title = titleEl?.textContent?.trim();
    if (!title) continue;

    const linkEl = card.querySelector('a[href*="/maps/org/"]');
    const href = linkEl?.getAttribute('href') ?? '';
    const idMatch = href.match(/\/maps\/org\/[^/]+\/(\d+)\//);
    const orgId = idMatch?.[1] ?? null;

    const dedupKey = orgId ?? title.trim().toLowerCase();
    if (orgId ? seenIds.has(orgId) : seenTitles.has(dedupKey)) continue;
    if (orgId) seenIds.add(orgId);
    seenTitles.add(dedupKey);

    const categoryEl = card.querySelector('.search-business-snippet-view__categories');
    const rawCategory = categoryEl?.textContent?.trim() || null;

    entries.push({ title, rawCategory });
  }

  return entries;
}

export function looksLikeBplist(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 8));
  return new TextDecoder('ascii').decode(bytes) === 'bplist00';
}
