import { convertToUsd } from '../../lib/currencyConvert';
import type { Currency } from '../../data/transactions';
import type { ExchangeRate } from '../../data/exchangeRates';
import type { EstimateMaterial } from '../../data/estimates';
import type { Cell, Column } from './priceComparisonModel';

// «Заказать всё в одном месте» — ответ на вопрос, который в таблице
// сравнения глазами не решается. Владелец, 2026-09-17: «хочу заказать всю
// краску в одном месте и понять, какой поставщик оптимальный. Критерии —
// максимальное количество позиций "ровно" по лучшей цене + адекватные цены
// на аналоги. Сейчас вручную сравнить столько цен стало сложно».
//
// Чем это НЕ является: не отбором по позициям (тот собирает корзину из
// разных поставщиков — это «На утверждение») и не выгрузкой лучших цен
// (bestPriceReport.ts — снимок рынка построчно, чтобы торговаться). Здесь
// одна единица оценки — ПОСТАВЩИК ЦЕЛИКОМ: что будет, если всю ведомость
// заказать только у него.
//
// Эталон, с которым сравниваем, — не «самая дешёвая цена вообще»: тогда
// победителем всегда становится тот, кто подменил всю ведомость дешёвым
// аналогом (у красок «Одиссей» выходил в 2,4 раза дешевле всех, предложив
// ВДАК-212 вместо Tikkurila и Dulux). Эталон собирается по правилу
// владельца: на позицию берётся лучшая цена среди «ровно», и только если
// «ровно» не дал НИКТО — лучшая среди замен. Тогда переплата поставщика
// читается одинаково в обе стороны: дорогой «ровно» её увеличивает,
// а дешёвый аналог на позиции, где «ровно» существует, честно показывает
// экономию — но экономию на другом товаре, и рядом стоит счётчик «ровно».

export interface RankingLine {
  position: EstimateMaterial;
  cell: Cell | null;
  // Цена эталона за единицу и то, из чего он взят: 'exact' — лучший «ровно»,
  // 'any' — «ровно» на позицию не дал никто, эталон из замен.
  referenceUnit: number | null;
  referenceKind: 'exact' | 'any' | null;
  referenceSupplier: string;
  // Разница с эталоном на весь объём позиции: > 0 — переплата, < 0 — дешевле
  // эталона. null — сравнить нечем (нет цены или нет курса).
  diff: number | null;
  // Он же и есть эталон по этой позиции.
  isReference: boolean;
}

export interface SupplierScore {
  column: Column;
  name: string;
  // Позиций ведомости с ценой и без неё.
  covered: number;
  missing: EstimateMaterial[];
  exact: number;
  alternative: number;
  check: number;
  // На скольких позициях его «ровно» — самое дешёвое среди «ровно».
  bestExact: number;
  // Сумма на объём по закрытым позициям и доставка, в валюте сравнения.
  total: number | null;
  delivery: number | null;
  // Переплата к эталонной корзине ПО ТЕМ ЖЕ позициям (непокрытые в счёт не
  // идут — иначе тот, кто прислал одну строку, выглядел бы лучше всех).
  overpay: number | null;
  lines: RankingLine[];
}

export interface Ranking {
  // Валюта, в которой сравниваются суммы: общая валюта столбцов, а если их
  // несколько — USD по курсу дня.
  currency: Currency;
  scores: SupplierScore[];
  // Позиции, на которые «ровно» не дал никто: там эталон собран из замен, и
  // переплата у всех считается мягче. Показываем оговоркой, а не прячем.
  noExactPositions: EstimateMaterial[];
  // Курса не хватило, часть сумм не сравнить.
  incomparable: boolean;
}

// Цена ячейки в валюте сравнения. base — общая валюта столбцов (тогда цены
// уже сопоставимы), иначе считаем в долларах.
function comparable(cell: Cell, base: Currency | null, rate: ExchangeRate | undefined): number | null {
  if (base) return cell.currency === base ? cell.unitPrice : convertToUsd(cell.unitPrice, cell.currency, rate);
  return cell.usdUnit ?? convertToUsd(cell.unitPrice, cell.currency, rate);
}

function money(amount: number, currency: Currency, base: Currency | null, rate: ExchangeRate | undefined): number | null {
  if (base && currency === base) return amount;
  return convertToUsd(amount, currency, rate);
}

export function buildRanking(columns: Column[], positions: EstimateMaterial[], rate: ExchangeRate | undefined): Ranking {
  const currencies = new Set(columns.map((c) => c.offer.currency));
  const base = currencies.size === 1 ? [...currencies][0] : null;
  const currency: Currency = base ?? 'USD';
  let incomparable = false;

  // Эталон по каждой позиции.
  const reference = new Map<string, { unit: number; kind: 'exact' | 'any'; supplier: string }>();
  const noExactPositions: EstimateMaterial[] = [];
  for (const p of positions) {
    let bestExact: { unit: number; supplier: string } | null = null;
    let bestAny: { unit: number; supplier: string } | null = null;
    for (const col of columns) {
      const cell = col.cells.get(p.id);
      if (!cell) continue;
      const value = comparable(cell, base, rate);
      if (value == null) {
        incomparable = true;
        continue;
      }
      if (!bestAny || value < bestAny.unit) bestAny = { unit: value, supplier: col.offer.name };
      if (cell.kind === 'exact' && (!bestExact || value < bestExact.unit)) bestExact = { unit: value, supplier: col.offer.name };
    }
    if (bestExact) reference.set(p.id, { ...bestExact, kind: 'exact' });
    else if (bestAny) {
      reference.set(p.id, { ...bestAny, kind: 'any' });
      noExactPositions.push(p);
    }
  }

  const scores: SupplierScore[] = [];
  for (const col of columns) {
    if (col.cells.size === 0) continue;
    const lines: RankingLine[] = [];
    const missing: EstimateMaterial[] = [];
    let covered = 0;
    let exact = 0;
    let alternative = 0;
    let check = 0;
    let bestExact = 0;
    let total: number | null = 0;
    let overpay: number | null = 0;
    for (const p of positions) {
      const cell = col.cells.get(p.id) ?? null;
      const ref = reference.get(p.id) ?? null;
      if (!cell) {
        missing.push(p);
        lines.push({
          position: p,
          cell: null,
          referenceUnit: ref?.unit ?? null,
          referenceKind: ref?.kind ?? null,
          referenceSupplier: ref?.supplier ?? '',
          diff: null,
          isReference: false,
        });
        continue;
      }
      covered += 1;
      if (cell.kind === 'exact') exact += 1;
      else if (cell.kind === 'alternative') alternative += 1;
      else check += 1;
      const value = comparable(cell, base, rate);
      const quantity = p.quantity ?? 0;
      if (value == null) {
        total = null;
        overpay = null;
        incomparable = true;
      } else if (total != null) {
        total += value * quantity;
      }
      const isReference = !!ref && value != null && ref.unit === value && (ref.kind === 'any' || cell.kind === 'exact');
      if (isReference && ref?.kind === 'exact') bestExact += 1;
      const diff = ref && value != null ? (value - ref.unit) * quantity : null;
      if (diff == null) overpay = null;
      else if (overpay != null) overpay += diff;
      lines.push({
        position: p,
        cell,
        referenceUnit: ref?.unit ?? null,
        referenceKind: ref?.kind ?? null,
        referenceSupplier: ref?.supplier ?? '',
        diff,
        isReference,
      });
    }
    scores.push({
      column: col,
      name: col.offer.name,
      covered,
      missing,
      exact,
      alternative,
      check,
      bestExact,
      total,
      delivery: col.delivery != null ? money(col.delivery, col.offer.currency, base, rate) : null,
      overpay,
      lines,
    });
  }

  // Порядок — по критериям владельца, а не по одной сумме: сперва «закрывает
  // ли он ведомость целиком» (ради этого всё и затевалось — заказать в одном
  // месте), затем сколько позиций идёт «ровно», и только потом деньги.
  // Сумма последним аргументом сознательно: поставщик, подменивший всю
  // ведомость аналогами, дешевле почти всегда — но это ответ на другой
  // вопрос, и он виден в строке «ровно 0».
  scores.sort(
    (a, b) =>
      b.covered - a.covered ||
      b.exact - a.exact ||
      b.bestExact - a.bestExact ||
      (a.overpay ?? Number.POSITIVE_INFINITY) - (b.overpay ?? Number.POSITIVE_INFINITY) ||
      a.name.localeCompare(b.name, 'ru'),
  );

  return { currency, scores, noExactPositions, incomparable };
}

// Кого предлагать как ответ на «где заказать всё». Победитель нужен только
// тогда, когда сравнивать есть с чем: один столбец — это не выбор, а
// единственное предложение.
export function rankingWinner(ranking: Ranking): SupplierScore | null {
  if (ranking.scores.length < 2) return null;
  return ranking.scores[0];
}
