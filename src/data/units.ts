// Справочник единиц измерения (шаг 7 плана docs/procurement-product-steps.md).
//
// Зачем он нужен. Единицу пишет то человек в смете («м²», «пог.м»), то
// поставщик в счёте («кв.м», «м.п.», «упак.»), и до этого справочника код
// умел ровно одно: свести написание к строке и сравнить строки
// (lib/units.ts, normalizeUnit). Этого хватает, чтобы понять «одно и то же
// или нет», и не хватает, чтобы посчитать: банка 9 л при смете в литрах,
// цена за кг при смете в тоннах, 200 г при смете в килограммах — везде
// нужен коэффициент, а не сравнение.
//
// Поэтому единица здесь — не строка, а запись: канонический код, размерность
// и множитель к базовой единице размерности. Пересчёт возможен только внутри
// одной размерности; литры в квадратные метры не переводятся ничем, кроме
// расхода материала (он живёт у позиции сметы, см. EstimateMaterial.
// consumption), и справочник этого не делает.
//
// Тара (уп, рул, мешок, банка) — отдельная размерность 'pack' без множителя.
// Это НЕ значит «не знаем сколько»: сколько в таре, знает конкретная строка
// счёта (PurchaseItem.packQty/packUnit), а не справочник — в одной упаковке
// бывает и 5, и 12 штук.

export type UnitDimension = 'count' | 'length' | 'area' | 'volume' | 'mass' | 'pack';

export interface UnitDef {
  // Канонический код — то, во что приводится любое написание. Совпадает с
  // тем, что возвращала normalizeUnit до справочника ('м2', 'шт', 'м3'),
  // чтобы уже сохранённые сопоставления не разъехались.
  code: string;
  // Как показываем человеку: 'м²' читается лучше, чем 'м2'.
  label: string;
  dimension: UnitDimension;
  // Сколько базовых единиц размерности в одной этой (база: шт, м, м², л, кг).
  // null — пересчёт невозможен в принципе (тара).
  factor: number | null;
  // Написания, которые встречаются в счетах и сметах. Squash (см. ниже)
  // снимает регистр, пробелы, точки и дефисы, поэтому «кв. м», «кв.м» и
  // «квм» — это одна запись 'кв.м'.
  synonyms: string[];
}

export const UNITS: UnitDef[] = [
  // Штучное
  { code: 'шт', label: 'шт', dimension: 'count', factor: 1, synonyms: ['шт.', 'штук', 'штука', 'штуки', 'pcs', 'pc', 'ед', 'ед.'] },
  { code: 'компл', label: 'компл', dimension: 'count', factor: 1, synonyms: ['комплект', 'комплекта', 'комплектов', 'к-т', 'set'] },
  { code: 'пара', label: 'пара', dimension: 'count', factor: 1, synonyms: ['пар', 'пары'] },
  // Длина
  { code: 'м', label: 'м', dimension: 'length', factor: 1, synonyms: ['метр', 'метра', 'метров', 'm'] },
  // Погонный метр физически тот же метр, но отдельной записью: в смете и в
  // счёте это разные графы, и подменять одно другим молча нельзя. Множитель
  // тот же, поэтому пересчёт между ними — тождество, а не догадка.
  { code: 'пог.м', label: 'пог. м', dimension: 'length', factor: 1, synonyms: ['пм', 'п.м', 'п.м.', 'м.п', 'м.п.', 'мп', 'погм', 'погонныйметр', 'пог.метр', 'погонных метров'] },
  { code: 'мм', label: 'мм', dimension: 'length', factor: 0.001, synonyms: ['mm'] },
  { code: 'см', label: 'см', dimension: 'length', factor: 0.01, synonyms: ['cm'] },
  { code: 'км', label: 'км', dimension: 'length', factor: 1000, synonyms: ['km'] },
  // Площадь
  { code: 'м2', label: 'м²', dimension: 'area', factor: 1, synonyms: ['кв.м', 'кв.метр', 'квадратныйметр', 'кв.м.', 'sqm', 'm2'] },
  { code: 'см2', label: 'см²', dimension: 'area', factor: 0.0001, synonyms: ['кв.см', 'cm2'] },
  // Объём
  { code: 'л', label: 'л', dimension: 'volume', factor: 1, synonyms: ['литр', 'литра', 'литров', 'ltr', 'ltrs', 'l'] },
  { code: 'мл', label: 'мл', dimension: 'volume', factor: 0.001, synonyms: ['ml'] },
  { code: 'м3', label: 'м³', dimension: 'volume', factor: 1000, synonyms: ['куб.м', 'кубм', 'кубическийметр', 'м.куб', 'm3'] },
  // Масса
  { code: 'кг', label: 'кг', dimension: 'mass', factor: 1, synonyms: ['kg', 'килограмм', 'килограмма', 'килограммов'] },
  { code: 'г', label: 'г', dimension: 'mass', factor: 0.001, synonyms: ['гр', 'грамм', 'грамма', 'граммов', 'g'] },
  { code: 'т', label: 'т', dimension: 'mass', factor: 1000, synonyms: ['тн', 'тонна', 'тонны', 'тонн', 'ton', 'tn'] },
  // Тара: сколько в ней — дело строки счёта, не справочника.
  { code: 'уп', label: 'уп', dimension: 'pack', factor: null, synonyms: ['упак', 'упак.', 'упаковка', 'упаковки', 'упаковок', 'pack'] },
  { code: 'рул', label: 'рул', dimension: 'pack', factor: null, synonyms: ['рулон', 'рулона', 'рулонов'] },
  { code: 'пач', label: 'пач', dimension: 'pack', factor: null, synonyms: ['пачка', 'пачки', 'пачек'] },
  { code: 'мешок', label: 'мешок', dimension: 'pack', factor: null, synonyms: ['меш', 'мешка', 'мешков'] },
  { code: 'ведро', label: 'ведро', dimension: 'pack', factor: null, synonyms: ['вед', 'ведра', 'вёдер', 'ведер'] },
  { code: 'банка', label: 'банка', dimension: 'pack', factor: null, synonyms: ['бан', 'банки', 'банок'] },
  { code: 'коробка', label: 'коробка', dimension: 'pack', factor: null, synonyms: ['кор', 'короб', 'коробки', 'коробок', 'box'] },
  { code: 'поддон', label: 'поддон', dimension: 'pack', factor: null, synonyms: ['паллет', 'паллета', 'палета', 'поддона', 'поддонов'] },
  { code: 'лист', label: 'лист', dimension: 'pack', factor: null, synonyms: ['листа', 'листов'] },
  { code: 'бухта', label: 'бухта', dimension: 'pack', factor: null, synonyms: ['бухты', 'бухт'] },
];

// Написание → сравнимый вид: без регистра, пробелов, точек и дефисов,
// с «²»/«³» как «2»/«3». «Кв. М», «кв.м» и «КВМ» после этого совпадают.
export function squashUnit(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/[\s.\-_]/g, '');
}

const BY_SQUASHED = new Map<string, UnitDef>();
for (const def of UNITS) {
  for (const spelling of [def.code, def.label, ...def.synonyms]) {
    const key = squashUnit(spelling);
    if (key) BY_SQUASHED.set(key, def);
  }
}

// Запись справочника по любому написанию. null — единица незнакомая
// («условная единица», «услуга», опечатка): это не ошибка, просто считать по
// ней нельзя, и вся логика ниже честно отвечает null.
export function unitDef(raw: string | null | undefined): UnitDef | null {
  const key = squashUnit(raw ?? '');
  return key ? (BY_SQUASHED.get(key) ?? null) : null;
}

export function canonicalUnit(raw: string | null | undefined): string | null {
  return unitDef(raw)?.code ?? null;
}

// Как показать единицу человеку. Незнакомую показываем как есть — выдумывать
// за пользователя нечего.
export function unitLabel(raw: string | null | undefined): string {
  return unitDef(raw)?.label ?? String(raw ?? '').trim();
}

export function isPackUnit(raw: string | null | undefined): boolean {
  return unitDef(raw)?.dimension === 'pack';
}

// Можно ли перевести одну единицу в другую: только внутри размерности и
// только там, где у обеих есть множитель.
export function canConvertUnits(from: string | null | undefined, to: string | null | undefined): boolean {
  const a = unitDef(from);
  const b = unitDef(to);
  return !!a && !!b && a.dimension === b.dimension && a.factor != null && b.factor != null;
}

// Количество из одной единицы в другую: 200 г → 0,2 кг.
export function convertQuantity(value: number, from: string, to: string): number | null {
  const a = unitDef(from);
  const b = unitDef(to);
  if (!a || !b || a.dimension !== b.dimension || a.factor == null || b.factor == null) return null;
  return (value * a.factor) / b.factor;
}

// Цена за единицу — в обратную сторону: 100 ₽ за кг это 100 000 ₽ за тонну.
export function convertUnitPrice(price: number, from: string, to: string): number | null {
  const a = unitDef(from);
  const b = unitDef(to);
  if (!a || !b || a.dimension !== b.dimension || a.factor == null || b.factor == null) return null;
  return (price * b.factor) / a.factor;
}
