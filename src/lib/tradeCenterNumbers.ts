import type { RetailFigureEntry } from '../data/businessCenters';

type Figure = Pick<RetailFigureEntry, 'label' | 'text'>;
export type NumberGroup = { kind: 'scale' | 'holidays' | 'building'; label: string; entries: RetailFigureEntry[] };
const words = (entry: Figure) => `${entry.label} ${entry.text ?? ''}`;
const newYear = /новогод|нов(?:ый|ому|ого)\s+(?:\d{4}\s+)?год/iu;

// Группы выводим из текста, без изменения данных ТЦ (владелец, 2026-09-25).
export function groupNumbers(entries: RetailFigureEntry[]): NumberGroup[] {
  if (entries.length < 4) return entries.length ? [{ kind: 'building', label: '', entries: [...entries] }] : [];
  const scale: RetailFigureEntry[] = [];
  const holidays: RetailFigureEntry[] = [];
  const building: RetailFigureEntry[] = [];
  for (const entry of entries) {
    const text = words(entry);
    if (/атриум|инсталляц|декорац|ёлк/iu.test(text) || newYear.test(text) || (/весн/iu.test(text) && /украш|украс/iu.test(text))) holidays.push(entry);
    else if (scale.length < 2 && /посещ|посетител|весь комплекс|общая площадь|торговая площадь|арендатор|магазин/iu.test(text)) scale.push(entry);
    else building.push(entry);
  }
  return [
    { kind: 'scale' as const, label: 'Масштаб', entries: scale },
    { kind: 'holidays' as const, label: 'Праздники в атриуме', entries: holidays },
    { kind: 'building' as const, label: 'Здание', entries: building },
  ].filter((group) => group.entries.length);
}

export function numberLabel(label: string): string {
  if (label.length <= 60) return label;
  const short = label.slice(0, 59);
  const boundary = short.lastIndexOf(' ');
  return `${short.slice(0, boundary > 0 ? boundary : 59).trimEnd()}…`;
}

export function numberIcon(entry: Figure) {
  const text = words(entry);
  if (/экран|led/iu.test(text)) return 'Monitor';
  if (/стекл|фасад/iu.test(text)) return 'PanelsTopLeft';
  if (/строител|стройк/iu.test(text)) return 'HardHat';
  if (/картинг|трасс/iu.test(text)) return 'Flag';
  if (/паркинг|машин/iu.test(text)) return 'Car';
  if (/лифт|эскалатор/iu.test(text)) return 'ArrowUpDown';
  if (/этаж|высот/iu.test(text)) return 'Building2';
  return 'Sparkles';
}

export function holidayDate(entry: Pick<RetailFigureEntry, 'label' | 'text' | 'date'>): string | null {
  if (!entry.date) return null;
  const text = words(entry);
  const year = entry.date.match(/\d{4}/)?.[0];
  if (year && newYear.test(text)) {
    const explicit = text.match(/нов(?:ый|ому|ого)\s+(\d{4})\s+год/iu)?.[1];
    const december = /декабр|^\d{4}-12(?:-|$)/iu.test(entry.date);
    return `Новый год ${explicit ?? (Number(year) + Number(december))}`;
  }
  if (year && /весн/iu.test(text)) return `Весна ${year}`;
  return entry.date.charAt(0).toUpperCase() + entry.date.slice(1);
}

const amountPattern = /\d+(?:[\s\u00a0]\d{3})*(?:[.,]\d+)?\s*(?:млн|тыс\.?)?/giu;
function amount(value: string): number {
  const digits = value.match(/[\d\s.,]+/)?.[0] ?? '';
  return Number(digits.replace(/\s/g, '').replace(',', '.')) * (/млн/iu.test(value) ? 1e6 : /тыс/iu.test(value) ? 1e3 : 1);
}

export type NumberFormat =
  | { kind: 'comparison'; label: string; value: string; ratio: number }
  | { kind: 'fields'; count: number; caption: string }
  | { kind: 'plain'; text: string };

export function numberFormat(entry: Pick<RetailFigureEntry, 'value' | 'text'>): NumberFormat {
  const text = entry.text ?? '';
  const own = amount(entry.value);
  for (const match of text.matchAll(amountPattern)) {
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    const nounBefore = before.match(/((?:жител[\p{L}]*|населен[\p{L}]*)[^.!?\d]{0,70})$/iu)?.[1];
    const nounAfter = after.match(/^\s*((?:жител[\p{L}]*|населен[\p{L}]*)[^.!?\d]{0,70})/iu)?.[1];
    const comparison = /больше,?\s+чем\s*$/iu.test(before) && /млн|тыс/iu.test(match[0]);
    const other = amount(match[0]);
    if (own > 0 && other > 0 && (nounBefore || nounAfter || comparison)) {
      const noun = (nounBefore ?? nounAfter ?? after.match(/^\s*([\p{L}]+(?:\s+[\p{L}]+)?)/u)?.[1] ?? 'Сравнение')
        .replace(/[\s(,:;]+$/gu, '').replace(/^жител[\p{L}]*/iu, 'Жители').replace(/^населен[\p{L}]*/iu, 'Население')
        .replace(/\s+(?:во?\s+)?всей\s+/iu, ' ');
      return { kind: 'comparison', label: noun.charAt(0).toUpperCase() + noun.slice(1), value: match[0].trim(), ratio: Math.min(other / own, 1) };
    }
  }
  const fields = text.match(/(?<![\d.,])\b(\d{1,2})\s+футбольных\s+полей(?![\p{L}])([^.]*)/iu);
  if (fields && Number(fields[1]) >= 1 && Number(fields[1]) <= 40) {
    const rest = fields[2].trim();
    return { kind: 'fields', count: Number(fields[1]), caption: `≈ ${fields[1]} футбольных полей${rest && rest.length <= 60 ? `${/^[,;:]/u.test(rest) ? '' : ' '}${rest}` : ''}` };
  }
  return { kind: 'plain', text: text.match(/^.*?(?:[.!?](?=\s|$)|$)/u)?.[0] ?? text };
}
