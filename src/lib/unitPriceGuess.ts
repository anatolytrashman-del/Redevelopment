import { sameUnit, normalizeUnit } from './units';

// Цена за единицу сметы из строки счёта.
//
// Владелец, 2026-09-04: «краска идёт в литрах, а поставщик выставляет
// количество банок по X литров... надо пересчитывать на литр, метр, штуку».
// Два случая, когда подсказку дать можно:
//   1) единица счёта совпадает с единицей сметы («м2» и «м²») — цена строки
//      и есть цена за единицу сметы;
//   2) у материала сметы задан расход (EstimateMaterial.consumption, единиц
//      товара на одну единицу сметы, слои уже учтены), а объём тары читается
//      из названия строки («9л», «9 л», «12кг», «2,5 l») — тогда
//      цена за единицу сметы = цена банки ÷ объём банки × расход.
// Иначе — пусто, пусть считает человек (объём тары знает только он).

export interface PackVolume {
  amount: number;
  unit: string;
}

// «Euro 7 Power (A) (9л) 11,6кг» → 9 л (первое совпадение по объёму, вес —
// запасной вариант, если объёма нет). Единица приводится к «л»/«кг»/«м2»…
export function parsePackVolume(name: string): PackVolume | null {
  const text = name.replace(/,/g, '.');
  const patterns: { re: RegExp; unit: string }[] = [
    // \b в JS не знает кириллицы — граница слова через lookahead.
    { re: /(\d+(?:\.\d+)?)\s*(?:литр[а-я]*|л|ltr|l)(?![а-яa-z])/i, unit: 'л' },
    { re: /(\d+(?:\.\d+)?)\s*(?:кг|kg)(?![а-яa-z])/i, unit: 'кг' },
    { re: /(\d+(?:\.\d+)?)\s*(?:м2|м²|кв\.?\s*м)(?![а-яa-z])/i, unit: 'м2' },
    { re: /(\d+(?:\.\d+)?)\s*(?:пог\.?\s*м|п\.?\s*м|м\.?\s*п)(?![а-яa-z])/i, unit: 'пог.м' },
  ];
  for (const { re, unit } of patterns) {
    const m = text.match(re);
    if (m) {
      const amount = Number(m[1]);
      if (Number.isFinite(amount) && amount > 0) return { amount, unit };
    }
  }
  return null;
}

export interface UnitPriceGuess {
  unitPrice: number;
  // Как посчитали — для подсказки под полем ввода.
  explanation: string;
}

export function guessUnitPrice(
  line: { name: string; unit: string; quantity: number | null; price: number | null },
  material: { unit: string; consumption?: number | null; consumptionUnit?: string },
): UnitPriceGuess | null {
  if (line.price == null || line.price <= 0) return null;
  if (sameUnit(line.unit, material.unit)) {
    return { unitPrice: round2(line.price), explanation: `единица счёта та же, что в смете (${material.unit})` };
  }
  const consumption = material.consumption ?? null;
  if (consumption == null || consumption <= 0) return null;
  const pack = parsePackVolume(line.name);
  if (!pack) return null;
  const consumptionUnit = material.consumptionUnit ?? '';
  if (consumptionUnit && normalizeUnit(consumptionUnit) !== normalizeUnit(pack.unit)) return null;
  const unitPrice = (line.price / pack.amount) * consumption;
  return {
    unitPrice: round2(unitPrice),
    explanation: `тара ${fmt(pack.amount)} ${pack.unit} за ${fmt(line.price)} ÷ ${fmt(pack.amount)} × расход ${fmt(consumption)} ${consumptionUnit || pack.unit}/${material.unit}`,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function fmt(v: number): string {
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
