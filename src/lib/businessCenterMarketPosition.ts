// Б1 и Б3 плана docs/bc-catalog-redesign-plan.md — «Место на рынке» и
// соседи. Чистые вычисления без JSX: и блок на карточке БЦ, и список
// соседей считают одно и то же по одним правилам.
//
// Зачем вообще: на карточке БЦ до 2026-09-16 не было НИ ОДНОЙ сравнительной
// цифры, кроме единственной строки про медиану класса под объявлениями.
// Страница отвечала «какая тут площадь», но не «много это или мало» — то
// есть оставалась справочником. Здесь каждая цифра получает базу сравнения.
//
// Принцип «не выдумываем» здесь жёсткий: строка сравнения появляется только
// когда есть и значение здания, и база; сравнение с выборкой меньше
// MIN_COMPARE_N не показывается вовсе, а не помечается звёздочкой.
//
// 2026-09-20, вторая версия вёрстки (первая — стопка горизонтальных полос
// от нуля, потом дот-плот с локальной мин-макс шкалой на строку — обе
// заменены по фидбеку владельца, разбор во втором заходе см. в журнале):
// каждая строка теперь рисуется на ОДНОЙ фиксированной шкале ±50% с центром
// в медиане класса, поэтому расстояние на шкале означает одно и то же
// в любой строке и на любой карточке БЦ — раньше (локальная шкала на
// строку, растянутая на всю ширину) расстояние между точками кодировало не
// величину разницы, а её долю от самой себя, то есть было примерно
// одинаковым что при разнице в 5%, что при разнице в 100%.
import type { BusinessCenter } from '../data/businessCenters';
import type { MarketSnapshot } from '../data/marketSnapshots';
import { nearestMetroMeters, type CatalogOfferIndex } from './businessCenterCatalogFilter';
import { mapRatingFromHighlights } from './businessCenterDisplay';

// Меньше пяти зданий — это не «медиана класса», а случайный набор.
// Отдельный порог от MIN_RELIABLE_N (15) в marketSnapshots: там речь про
// число ОБЪЯВЛЕНИЙ в снимке рынка, здесь — про число ЗДАНИЙ в справочнике,
// и 143 записи на четыре класса просто не дают таких выборок.
export const MIN_COMPARE_N = 5;

// Разница меньше этого порога — не «здание чуть хуже/лучше», а шум выборки:
// красить и подписывать её как реальный перевес значит врать точностью,
// которой у медианы по 5-60 зданиям нет.
const NEAR_TYPICAL_THRESHOLD_PCT = 3;
// Больше этого — шкала ±50% упирается в край: дальше идёт шеврон, а точная
// величина остаётся только текстом (кратностью, не процентом — «в 3 раза
// дороже» читается, «на 300% дороже» нет).
export const AXIS_DOMAIN_PCT = 50;

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return Math.round(mid * 100) / 100;
}

// Дополнительная база (район, город у ставки/цены) — засечка на той же оси,
// что и главный бар, без своего текста-вывода: он был бы шестым-седьмым
// предложением в строке, которую и так тяжело читать.
export interface ComparisonTick {
  label: string;
  displayValue: string;
  // Тот же знак, что у deltaPct бара: относительно ГЛАВНОЙ базы (медианы
  // класса), не абсолютное значение — иначе засечка и бар считались бы
  // по разным нулям и разъезжались на глаз.
  deltaPct: number;
}

export interface ComparisonBar {
  label: string;
  subjectDisplayValue: string;
  // "медиана класса B — $11,56/м² · Партизанский $10,06/м² · город $13/м²"
  captionText: string;
  // Знак: положительное — здание выигрывает у базы (или, для нейтральных
  // метрик вроде года сдачи, просто «выше» по оси), отрицательное —
  // проигрывает. Не обрезано до ±50 — обрезка (для ширины бара) отдельно
  // на стороне вёрстки, а тут исходная величина нужна текстом.
  deltaPct: number;
  tone: 'favorable' | 'unfavorable' | 'neutral';
  // Разница меньше NEAR_TYPICAL_THRESHOLD_PCT — бар не рисуется вовсе
  // (точка по центру), см. компонент.
  nearTypical: boolean;
  deltaText: string;
  ticks: ComparisonTick[];
}

export interface MarketPosition {
  bars: ComparisonBar[];
  // "Сильнее типичного БЦ класса по 4 из 7 показателей" — null, когда
  // сравнивать почти не с чем (меньше трёх строк) или здание нигде не
  // выигрывает: "по 0 из 7" не вывод, а придирка.
  summary: string | null;
}

function formatValue(value: number, unit: string): string {
  // Деньги пишем как «$18/м²», а не «18 $/м²» — так же, как везде на
  // сайте; остальные единицы идут после числа.
  return unit.startsWith('$') ? `$${value.toLocaleString('ru-RU')}${unit.slice(1)}` : `${value.toLocaleString('ru-RU')} ${unit}`;
}

function pctDelta(value: number, base: number): number {
  if (base === 0) return 0;
  return ((value - base) / base) * 100;
}

// "в 2 раза дороже" — при разнице ≥100% кратность читается, процент нет.
function formatRatio(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10;
  const numText = rounded.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  if (!Number.isInteger(rounded)) return `${numText} раза`;
  const mod10 = rounded % 10;
  const mod100 = rounded % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'раз' : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'раза' : 'раз';
  return `${numText} ${word}`;
}

interface DeltaResult {
  deltaPct: number;
  tone: ComparisonBar['tone'];
  nearTypical: boolean;
  deltaText: string;
}

// lowerIsBetter — у ставки/цены/расстояния до метро меньше значит лучше,
// у парковки/лифтов/потолков/рейтинга больше; words — [слово когда меньше
// базы, слово когда больше], независимо от того, что из этого хорошая
// новость (см. комментарий у ComparisonBar раньше в этом файле).
// inherentlyNeutral — метрика без однозначного «лучше», красим серым
// всегда, а не только у почти равных значений (год сдачи, число
// арендаторов — старше/больше не значит хуже/лучше для арендатора).
function buildDelta(value: number, base: number, lowerIsBetter: boolean, words: [string, string], inherentlyNeutral: boolean): DeltaResult {
  const rawPct = pctDelta(value, base);
  const absPct = Math.abs(rawPct);
  const barPct = lowerIsBetter ? -rawPct : rawPct;
  const nearTypical = absPct < NEAR_TYPICAL_THRESHOLD_PCT;
  const tone: ComparisonBar['tone'] = nearTypical || inherentlyNeutral ? 'neutral' : barPct >= 0 ? 'favorable' : 'unfavorable';
  let deltaText: string;
  if (nearTypical) {
    deltaText = 'на уровне медианы';
  } else {
    const word = value < base ? words[0] : words[1];
    deltaText = absPct >= 100 ? `в ${formatRatio(value < base ? base / value : value / base)} ${word}` : `${Math.round(absPct)}% ${word}`;
  }
  return { deltaPct: barPct, tone, nearTypical, deltaText };
}

function buildTick(label: string, value: number, primaryBase: number, lowerIsBetter: boolean, unit: string): ComparisonTick {
  const rawPct = pctDelta(value, primaryBase);
  return { label, displayValue: formatValue(value, unit), deltaPct: lowerIsBetter ? -rawPct : rawPct };
}

function buildCaption(baseLabel: string, baseValue: number, unit: string, ticks: ComparisonTick[]): string {
  const extra = ticks.map((t) => `${t.label} ${t.displayValue}`).join(' · ');
  return extra ? `медиана ${baseLabel} — ${formatValue(baseValue, unit)} · ${extra}` : `медиана ${baseLabel} — ${formatValue(baseValue, unit)}`;
}

function elevatorProvision(center: Pick<BusinessCenter, 'elevators' | 'totalArea'>): number | null {
  if (center.elevators == null || center.totalArea == null || center.totalArea <= 0) return null;
  return Math.round((center.elevators / center.totalArea) * 1_000_000) / 100;
}

// Год сдачи — особый случай: на шкале считаем по ВОЗРАСТУ (иначе 2007 и
// 2013 — это 0,3% разницы «от нуля», обе полоски выглядели одинаково
// длинными), а в тексте, наоборот, оставляем то, что человек и правда
// хочет прочитать — «на 6 лет старше», не «на 46% старше».
function yearDeltaText(value: number, base: number): string {
  const delta = Math.round(Math.abs(value - base) * 10) / 10;
  if (delta === 0) return 'на уровне медианы';
  const integer = Number.isInteger(delta);
  const rounded = Math.round(delta);
  const mod10 = rounded % 10;
  const mod100 = rounded % 100;
  const unit = !integer ? 'года' : mod10 === 1 && mod100 !== 11 ? 'год' : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'года' : 'лет';
  return `на ${delta.toLocaleString('ru-RU')} ${unit} ${value < base ? 'старше' : 'новее'}`;
}

export function buildMarketPosition(
  center: BusinessCenter,
  all: BusinessCenter[],
  snapshots: MarketSnapshot[] | null,
  offers: CatalogOfferIndex,
): MarketPosition {
  const bars: ComparisonBar[] = [];
  const sameClass = center.businessClass ? all.filter((c) => c.businessClass === center.businessClass) : [];
  const classLabel = `класса ${center.businessClass}`;

  // --- Ставка аренды: здание против класса, района и города --------------
  const buildingRent = offers.rentBySlug.get(center.slug)?.median ?? null;
  if (buildingRent != null && center.businessClass) {
    const find = (type: MarketSnapshot['sliceType'], key: string) =>
      (snapshots ?? []).find((s) => s.deal === 'rent' && s.sliceType === type && s.sliceKey === key)?.median ?? null;
    const classMedian = find('class', center.businessClass);
    if (classMedian != null) {
      const districtMedian = center.district ? find('district', center.district) : null;
      const cityMedian = find('city', 'all');
      const unit = '$/м²';
      const ticks = [
        districtMedian != null && center.district ? buildTick(center.district, districtMedian, classMedian, true, unit) : null,
        cityMedian != null ? buildTick('город', cityMedian, classMedian, true, unit) : null,
      ].filter((t): t is ComparisonTick => t !== null);
      const d = buildDelta(buildingRent, classMedian, true, ['дешевле', 'дороже'], false);
      bars.push({
        label: 'Ставка аренды',
        subjectDisplayValue: formatValue(buildingRent, unit),
        captionText: buildCaption(`класса ${center.businessClass}`, classMedian, unit, ticks),
        deltaPct: d.deltaPct,
        tone: d.tone,
        nearTypical: d.nearTypical,
        deltaText: d.deltaText,
        ticks,
      });
    }
  }

  // --- Цена продажи: здание против класса, района и города --------------
  const buildingSale = offers.saleBySlug.get(center.slug)?.median ?? null;
  if (buildingSale != null && center.businessClass) {
    const find = (type: MarketSnapshot['sliceType'], key: string) =>
      (snapshots ?? []).find((s) => s.deal === 'sale' && s.sliceType === type && s.sliceKey === key)?.median ?? null;
    const classMedian = find('class', center.businessClass);
    if (classMedian != null) {
      const districtMedian = center.district ? find('district', center.district) : null;
      const cityMedian = find('city', 'all');
      const unit = '$/м²';
      const ticks = [
        districtMedian != null && center.district ? buildTick(center.district, districtMedian, classMedian, true, unit) : null,
        cityMedian != null ? buildTick('город', cityMedian, classMedian, true, unit) : null,
      ].filter((t): t is ComparisonTick => t !== null);
      const d = buildDelta(buildingSale, classMedian, true, ['дешевле', 'дороже'], false);
      bars.push({
        label: 'Цена продажи',
        subjectDisplayValue: formatValue(buildingSale, unit),
        captionText: buildCaption(`класса ${center.businessClass}`, classMedian, unit, ticks),
        deltaPct: d.deltaPct,
        tone: d.tone,
        nearTypical: d.nearTypical,
        deltaText: d.deltaText,
        ticks,
      });
    }
  }

  // --- До метро: здание против медианы класса ---------------------------
  const metro = nearestMetroMeters(center);
  if (metro != null && sameClass.length >= MIN_COMPARE_N && center.businessClass) {
    const classMetro = median(sameClass.map(nearestMetroMeters).filter((v): v is number => v != null));
    if (classMetro != null) {
      const unit = 'м по прямой';
      const d = buildDelta(metro, classMetro, true, ['ближе', 'дальше'], false);
      bars.push({
        label: 'До метро',
        subjectDisplayValue: formatValue(metro, unit),
        captionText: buildCaption(classLabel, classMetro, unit, []),
        deltaPct: d.deltaPct,
        tone: d.tone,
        nearTypical: d.nearTypical,
        deltaText: d.deltaText,
        ticks: [],
      });
    }
  }

  // --- Парковка ---------------------------------------------------------
  if (center.parkingRatio != null && sameClass.length >= MIN_COMPARE_N && center.businessClass) {
    const classParking = median(sameClass.map((c) => c.parkingRatio).filter((v): v is number => v != null));
    if (classParking != null) {
      const unit = 'маш./100 м²';
      const d = buildDelta(center.parkingRatio, classParking, false, ['меньше', 'больше'], false);
      bars.push({
        label: 'Парковка',
        subjectDisplayValue: formatValue(center.parkingRatio, unit),
        captionText: buildCaption(classLabel, classParking, unit, []),
        deltaPct: d.deltaPct,
        tone: d.tone,
        nearTypical: d.nearTypical,
        deltaText: d.deltaText,
        ticks: [],
      });
    }
  }

  // --- Высота потолков --------------------------------------------------
  if (center.ceilingHeight != null && center.businessClass) {
    const classValues = sameClass.map((c) => c.ceilingHeight).filter((v): v is number => v != null);
    const classCeiling = classValues.length >= MIN_COMPARE_N ? median(classValues) : null;
    if (classCeiling != null) {
      const unit = 'м';
      const d = buildDelta(center.ceilingHeight, classCeiling, false, ['ниже', 'выше'], false);
      bars.push({
        label: 'Высота потолков',
        subjectDisplayValue: formatValue(center.ceilingHeight, unit),
        captionText: buildCaption(classLabel, classCeiling, unit, []),
        deltaPct: d.deltaPct,
        tone: d.tone,
        nearTypical: d.nearTypical,
        deltaText: d.deltaText,
        ticks: [],
      });
    }
  }

  // --- Лифты на 10 000 м² ----------------------------------------------
  const buildingElevators = elevatorProvision(center);
  if (buildingElevators != null && center.businessClass) {
    const classValues = sameClass.map(elevatorProvision).filter((v): v is number => v != null);
    const classElevators = classValues.length >= MIN_COMPARE_N ? median(classValues) : null;
    if (classElevators != null) {
      const unit = 'шт.';
      const d = buildDelta(buildingElevators, classElevators, false, ['меньше', 'больше'], false);
      bars.push({
        label: 'Лифты на 10 000 м²',
        subjectDisplayValue: formatValue(buildingElevators, unit),
        captionText: buildCaption(classLabel, classElevators, unit, []),
        deltaPct: d.deltaPct,
        tone: d.tone,
        nearTypical: d.nearTypical,
        deltaText: d.deltaText,
        ticks: [],
      });
    }
  }

  // --- Год сдачи --------------------------------------------------------
  // Нейтральна всегда (см. комментарий у buildDelta), а не только когда
  // разница мала: старше не значит хуже.
  if (center.status === 'built' && center.yearBuilt != null && center.businessClass) {
    const classValues = sameClass
      .filter((c) => c.status === 'built')
      .map((c) => c.yearBuilt)
      .filter((v): v is number => v != null);
    const classYear = classValues.length >= MIN_COMPARE_N ? median(classValues) : null;
    if (classYear != null) {
      const currentYear = new Date().getFullYear();
      const ageValue = currentYear - center.yearBuilt;
      const ageBase = currentYear - classYear;
      const d = buildDelta(ageValue, ageBase, true, ['новее', 'старше'], true);
      bars.push({
        label: 'Год сдачи',
        subjectDisplayValue: `${center.yearBuilt} г.`,
        captionText: buildCaption(classLabel, classYear, 'г.', []),
        deltaPct: d.deltaPct,
        tone: 'neutral',
        nearTypical: d.nearTypical,
        deltaText: yearDeltaText(center.yearBuilt, classYear),
        ticks: [],
      });
    }
  }

  // --- Компаний-арендаторов ----------------------------------------------
  // Пустой массив здесь — почти всегда «снимок 2ГИС/Яндекса для этого здания
  // ещё не собирали», а не «ноль компаний»: у 136 из 141 БЦ список непустой.
  // Поэтому, как и для остальных метрик выше, нули из выборки исключаются,
  // а не считаются за настоящий ноль. Нейтральна всегда (владелец,
  // 2026-09-20: больше соседей по этажу — не однозначно плюс арендатору).
  const buildingTenants = center.tenantOrganizations.length;
  if (buildingTenants > 0 && center.businessClass) {
    const classValues = sameClass.map((c) => c.tenantOrganizations.length).filter((n) => n > 0);
    const classTenants = classValues.length >= MIN_COMPARE_N ? median(classValues) : null;
    if (classTenants != null) {
      const unit = 'шт.';
      const d = buildDelta(buildingTenants, classTenants, false, ['меньше', 'больше'], true);
      bars.push({
        label: 'Компаний-арендаторов',
        subjectDisplayValue: formatValue(buildingTenants, unit),
        captionText: buildCaption(classLabel, classTenants, unit, []),
        deltaPct: d.deltaPct,
        tone: 'neutral',
        nearTypical: d.nearTypical,
        deltaText: d.deltaText,
        ticks: [],
      });
    }
  }

  // --- Рейтинг Яндекс.Карт --------------------------------------------------
  // Раньше здесь стоял gisRating (2ГИС, "Рейтинг 2ГИС") — тот же экран, где
  // бейдж наверху карточки БЦ показывает рейтинг Яндекс.Карт
  // (mapRatingFromHighlights), и у части зданий числа по двум источникам
  // расходятся: владелец увидел скриншот с 3,8 в бейдже и 5 в этом блоке и
  // прочитал это как противоречие/баг. Решение владельца, 2026-09-20: «по
  // умолчанию у нас везде рейтинг с Яндекс.Карт должен быть» — переключаем
  // источник этой строки на тот же, что у бейджа, а не просто переименовываем
  // подпись. Заодно у Яндекса шире охват (107 БЦ из 141 против 45 у 2ГИС) —
  // сравнение чаще набирает MIN_COMPARE_N. 2ГИС остаётся там, где источник
  // явно назван в подписи (CatalogCompare, фильтр каталога, «Что говорят»)
  // — это осознанный выбор той функции, не путаница источников.
  const subjectRating = mapRatingFromHighlights(center.highlights);
  if (subjectRating != null && center.businessClass) {
    const classValues = sameClass.map((c) => mapRatingFromHighlights(c.highlights)?.value ?? null).filter((v): v is number => v != null);
    const classRating = classValues.length >= MIN_COMPARE_N ? median(classValues) : null;
    if (classRating != null) {
      const unit = '★';
      const d = buildDelta(subjectRating.value, classRating, false, ['ниже', 'выше'], false);
      bars.push({
        label: 'Рейтинг Яндекс.Карт',
        subjectDisplayValue: formatValue(subjectRating.value, unit),
        captionText: buildCaption(classLabel, classRating, unit, []),
        deltaPct: d.deltaPct,
        tone: d.tone,
        nearTypical: d.nearTypical,
        deltaText: d.deltaText,
        ticks: [],
      });
    }
  }

  const favorableCount = bars.filter((b) => b.tone === 'favorable').length;
  const summary = bars.length >= 3 && favorableCount > 0 ? `Сильнее типичного БЦ ${classLabel} по ${favorableCount} из ${bars.length} показателей` : null;

  return { bars, summary };
}

export interface NeighbourCenter {
  center: BusinessCenter;
  meters: number;
}

// Соседи — по прямой от координат (Д2), не по дорожной сети: маршрутов у
// нас нет, и выдумывать «7 минут пешком» по воздуху было бы враньём.
export function nearestNeighbours(center: BusinessCenter, all: BusinessCenter[], limit = 5): NeighbourCenter[] {
  if (center.lat == null || center.lng == null) return [];
  return all
    .filter((c) => c.slug !== center.slug && c.lat != null && c.lng != null)
    .map((c) => ({ center: c, meters: haversineMeters(center.lat as number, center.lng as number, c.lat as number, c.lng as number) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);
}
