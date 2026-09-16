import { sameUnit } from './units';
import { canConvertUnits, convertQuantity, convertUnitPrice, unitLabel } from '../data/units';
import { grossUp, type VatBasis } from '../data/vat';

// Цена за единицу сметы из строки счёта.
//
// Владелец, 2026-09-04: «краска идёт в литрах, а поставщик выставляет
// количество банок по X литров... надо пересчитывать на литр, метр, штуку».
// Случаи, когда подсказку дать можно:
//   1) единица счёта совпадает с единицей сметы («м2» и «м²») — цена строки
//      и есть цена за единицу сметы;
//   2) единицы разные, но одной размерности (кг и т, м и пог.м, мл и л) —
//      пересчёт по справочнику data/units.ts;
//   3) известна тара (PurchaseItem.packQty/packUnit со счёта, а если их нет —
//      объём, вычитанный из названия: «9л», «12кг», «2,5 l»):
//      а) у материала сметы задан расход (EstimateMaterial.consumption,
//         единиц товара на одну единицу сметы, слои уже учтены) — цена
//         банки ÷ объём банки × расход;
//      б) расхода нет, но содержимое тары измеряется в единицах сметы
//         (банка 9 л при смете в литрах) — цена банки ÷ объём банки.
// Иначе — пусто, пусть считает человек (сколько в таре, знает только он).
//
// Поверх всего этого — НДС (шаг 7 плана закупок): если счёт сказал «цены
// без НДС», подсказка приводится к цене с НДС по ставке счёта, а если он её
// не назвал — по ставке страны юрлица. Раньше это делала кнопка «+22% НДС»,
// то есть зависело от того, заметила ли закупщица приписку в документе.

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

// Тара строки: сначала то, что записано данными (распознавание счёта, шаг 7),
// и только потом разбор названия. Данные надёжнее регулярного выражения:
// «Плёнка 200 м2 в рулоне 60 м» название путает, счёт — нет.
export function packVolumeOf(line: { name: string; packQty?: number | null; packUnit?: string }): PackVolume | null {
  const qty = line.packQty ?? null;
  const unit = (line.packUnit ?? '').trim();
  if (qty != null && qty > 0 && unit) return { amount: qty, unit };
  return parsePackVolume(line.name);
}

export interface UnitPriceGuess {
  unitPrice: number;
  // Как посчитали — для подсказки под полем ввода.
  explanation: string;
}

export interface UnitPriceLine {
  name: string;
  unit: string;
  quantity: number | null;
  price: number | null;
  packQty?: number | null;
  packUnit?: string;
}

// Основание для НДС: обычно одно на весь счёт (условия КП), поэтому
// передаётся отдельно от строки. countryRate — ставка страны юрлица,
// запасной вариант, когда счёт сказал «без НДС», но ставку не назвал.
export interface UnitPriceVat extends VatBasis {
  countryRate?: number | null;
}

export function guessUnitPrice(
  line: UnitPriceLine,
  material: { unit: string; consumption?: number | null; consumptionUnit?: string },
  vat?: UnitPriceVat | null,
): UnitPriceGuess | null {
  if (line.price == null || line.price <= 0) return null;
  const base = baseGuess(line, material);
  if (!base) return null;
  const gross = grossUp(base.unitPrice, vat, vat?.countryRate ?? null);
  return {
    unitPrice: round2(gross.price),
    explanation: gross.adjusted ? `${base.explanation}; цена счёта без НДС, добавлено ${gross.rate}%` : base.explanation,
  };
}

// Цена за единицу сметы в той же базе НДС, в какой выставлен счёт.
function baseGuess(
  line: UnitPriceLine,
  material: { unit: string; consumption?: number | null; consumptionUnit?: string },
): UnitPriceGuess | null {
  const price = line.price as number;
  if (sameUnit(line.unit, material.unit)) {
    return { unitPrice: price, explanation: `единица счёта та же, что в смете (${unitLabel(material.unit)})` };
  }
  if (canConvertUnits(line.unit, material.unit)) {
    const converted = convertUnitPrice(price, line.unit, material.unit);
    if (converted != null) {
      return {
        unitPrice: converted,
        explanation: `пересчёт ${unitLabel(line.unit)} → ${unitLabel(material.unit)} по справочнику единиц`,
      };
    }
  }
  const pack = packVolumeOf(line);
  if (!pack) return null;

  const consumption = material.consumption ?? null;
  const consumptionUnit = (material.consumptionUnit ?? '').trim();
  if (consumption != null && consumption > 0) {
    // Расход задан в своих единицах («0,25 л на 1 м²») — приводим к ним
    // объём тары, а не наоборот: расход написал человек, тару прислал
    // поставщик, и подстраиваться должен документ.
    const packInConsumptionUnit = !consumptionUnit
      ? pack.amount
      : sameUnit(consumptionUnit, pack.unit)
        ? pack.amount
        : convertQuantity(pack.amount, pack.unit, consumptionUnit);
    if (packInConsumptionUnit != null && packInConsumptionUnit > 0) {
      const unit = consumptionUnit || pack.unit;
      return {
        unitPrice: (price / packInConsumptionUnit) * consumption,
        explanation: `тара ${fmt(packInConsumptionUnit)} ${unitLabel(unit)} за ${fmt(price)} ÷ ${fmt(packInConsumptionUnit)} × расход ${fmt(consumption)} ${unitLabel(unit)}/${unitLabel(material.unit)}`,
      };
    }
    return null;
  }

  // Расхода нет, но тара измеряется в единицах сметы: «банка 9 л» при смете
  // в литрах — цена литра считается без всякого расхода. Ради этого случая
  // шаг 7 и затевался (краска 4 500 ₽ за банку → 500 ₽ за литр).
  const perPackUnit = price / pack.amount;
  if (sameUnit(pack.unit, material.unit)) {
    return {
      unitPrice: perPackUnit,
      explanation: `тара ${fmt(pack.amount)} ${unitLabel(pack.unit)} за ${fmt(price)} ÷ ${fmt(pack.amount)}`,
    };
  }
  const converted = convertUnitPrice(perPackUnit, pack.unit, material.unit);
  if (converted != null) {
    return {
      unitPrice: converted,
      explanation: `тара ${fmt(pack.amount)} ${unitLabel(pack.unit)} за ${fmt(price)} ÷ ${fmt(pack.amount)}, пересчёт в ${unitLabel(material.unit)}`,
    };
  }
  return null;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function fmt(v: number): string {
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
