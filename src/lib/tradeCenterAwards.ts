import type { RetailAwardEntry, RetailRankingEntry } from '../data/businessCenters';
import { awardResultLabel } from './tradeCenterRetail';

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Короткие плитки без поясняющих абзацев — владелец, 2026-09-25.
export function shortRankingTitle(entry: RetailRankingEntry): string {
  const original = entry.headline?.trim() || `${entry.criterion} ${entry.scope}`.trim();
  let title = original
    .replace(/^\d+[-‑–](?:й|е|я)\s+(?:место\s+(?:(?:среди|в)\s+)?)?/iu, '')
    .replace(/^(?:Первое|Второе|Третье|Первый|Второй|Третий)\s+место\s+(?:в|среди)\s+(?:топ[-‑–]?\d+\s+)?/iu, '')
    .replace(/^Один из (?:двух|тр[её]х)\s+/iu, '')
    .replace(/^В десятке\s+/iu, '')
    .replace(/\s+по опросу горожан.*$/iu, '')
    .replace(/\s+по оценке Onliner.*$/iu, '')
    .replace(/:\s*.*знают\s+\d+(?:[.,]\d+)?%\s+опрошенных минчан.*$/iu, '')
    .replace(/\s+на\s+\d{4}\s+год[а]?\s*$/iu, '')
    .replace(/\s+Onliner(?:,.*)?$/iu, '');
  const ordinals = ['Первый', 'Второй', 'Третий'];
  if (entry.place >= 1 && entry.place <= 3) {
    title = title.replace(new RegExp(`^${ordinals[entry.place - 1]}\\s+`, 'iu'), '');
  }
  title = title
    .replace(/^лучших паркингов/iu, 'Лучшие паркинги')
    .replace(/^по посещаемости торговый центр/iu, 'По посещаемости среди ТЦ')
    .trim();
  return upperFirst(title.length < 12 ? original : title);
}

export function rankingSource(entry: RetailRankingEntry & { org?: string | null }): string {
  const context = [entry.scope, entry.criterion, entry.source, entry.org].join(' ');
  if (/MASMI|МАСМИ/iu.test(context)) return 'Опрос MASMI';
  if (/опрос/iu.test(`${context} ${entry.headline ?? ''}`)) return 'Опрос горожан';
  if (/Onliner/iu.test(`${entry.headline ?? ''} ${entry.source ?? ''}`)) return 'Onliner';
  if (/арендопригодн|арендн/iu.test(entry.criterion)) return 'По арендной площади';
  if (/общая площадь|общей площади/iu.test(entry.criterion)) return 'По общей площади';
  return upperFirst(entry.criterion.split(/[:(]/u)[0].trim());
}

export function rankingBadge(entry: RetailRankingEntry): { main: string; sub: string | null } {
  const score = /оценк/iu.test(entry.criterion)
    ? entry.value?.match(/^(\d+(?:[.,]\d+)?)\s+балл(?:а|ов)?\s+из\s+(\d+(?:[.,]\d+)?)/iu)
    : null;
  return score
    ? { main: `${score[1]}/${score[2]}`, sub: 'баллов' }
    : { main: `№${entry.place}`, sub: entry.total != null ? `из ${entry.total}` : null };
}

export function shortAwardTitle(award: RetailAwardEntry): string {
  return upperFirst(award.title.split(' — ')[0]
    .replace(/[,\s]+\d{4}(?:[–-]\d{4})?\s*$/u, '')
    .replace(/^Медаль и диплом\s+[IVX\d]+\s+степени\s+(?:[IVX]+\s+)?/iu, '')
    .replace(/^Республиканского конкурса/iu, 'Республиканский конкурс')
    .trim());
}

export function awardCategory(award: RetailAwardEntry): string {
  let category = award.category?.trim() || award.title.match(/—\s*«([^»]+)»/u)?.[1] || '';
  if (/^[a-z]/iu.test(category)) {
    category = [...category.matchAll(/\(([^()]*[а-яё][^()]*)\)/giu)][0]?.[1] ?? category;
  }
  return upperFirst(category.replace(/^раздел\s+«([^»]+)»$/iu, '$1'));
}

export function awardPill(award: RetailAwardEntry): string {
  const text = award.resultText?.trim() || awardResultLabel(award) || 'Награда';
  if (award.result === 'other' && text.length > 20) return 'Награда';
  if (award.result === 'diploma' && /медаль/iu.test(text)) {
    const degree = text.match(/([IVX\d]+)\s+степени/iu)?.[1];
    return degree ? `Медаль ${degree} степени` : 'Медаль';
  }
  return upperFirst(text);
}

export function sortRankingTiles(entries: RetailRankingEntry[]): RetailRankingEntry[] {
  return [...entries].sort((a, b) => Number(b.place === 1) - Number(a.place === 1)
    || (b.year ?? -Infinity) - (a.year ?? -Infinity));
}

export function sortAwardTiles(awards: RetailAwardEntry[]): RetailAwardEntry[] {
  const year = (value: string | null) => Math.max(...(value?.match(/\d{4}/g)?.map(Number) ?? []));
  return [...awards].sort((a, b) => year(b.year) - year(a.year));
}
