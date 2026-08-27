import type { DocumentFile } from './contractorDocuments';
import type { Currency } from './transactions';
import { RESEARCH_CURRENCIES } from './supplierResearch';
import type { ExchangeRate } from './exchangeRates';
import { convertToByn } from '../lib/currencyConvert';

// BYN/USD/RUB — тот же набор, что и у "Поставщики"/"Подрядчики → Ресерч"
// (без EUR, владелец явно ограничил список именно этими тремя для сметы).
export const LINE_ITEM_CURRENCIES = RESEARCH_CURRENCIES;

// Смета реновации — привязана к объекту (RealtyObject), живёт отдельной
// вкладкой в админке (Estimates.tsx/EstimateDetail.tsx). Построчная смета
// (см. EstimateLineItem ниже) ДОПОЛНИТЕЛЬНО публикуется наружу по
// shareToken (см. Estimate.shareToken, /estimate/:token,
// EstimatePublicPage.tsx) — владелец отправляет ссылку строителю
// (Артём) для правки строк напрямую, без доступа к остальной CRM
// (тексту разделов, материалам, вопросам — та часть остаётся закрытой).
// Техзадание (Brief) для сравнения — публикуется целиком с самого начала.
//
// Контент — разделы свободного текста (Фасад/Кабинеты/...), а не жёстко
// структурированные позиции с полями: состав работ ещё меняется по ходу
// уточнений, и текстовый блок с ручным форматированием (списки через "-",
// акценты через **жирный**) гибче, чем формы под каждое поле. Тот же
// принцип, что у RealtyObject.concept/notes — просто выросший в несколько
// именованных разделов вместо одного поля.

// Ссылка на конкретный товар/материал — "Дверь", "Замок" и т.п., каждая со
// своим фото и ссылкой на источник (магазин/каталог поставщика). Тот же
// принцип, что у PhotoChange.referenceImageUrl/referenceUrl в техзадании
// (data/briefs.ts), но здесь может быть несколько референсов на одну
// позицию сразу (дверь + замок), а не один на правку.
// Цена — сразу в трёх валютах (поставщики в Минске и Москве считают по-
// разному, плюс нужен ориентир в долларах), BYN — основная. Каждая
// заполняется независимо вручную, без автоконвертации по курсу.
export interface EstimateProductRef {
  id: string;
  label: string;
  manufacturer: string;
  model: string;
  // Пусто — цена в этой валюте ещё не известна.
  priceByn: number | null;
  priceRub: number | null;
  priceUsd: number | null;
  photoUrl: string;
  link: string;
}

// Оттенок по RAL (см. src/data/ralColors.ts под пресеты) — для позиций
// покраски: "серия прямоугольников", каждый — выбранный/уточняемый цвет.
// hex может быть пустым, если код внесён вручную (не из пресета).
export interface RalColor {
  id: string;
  code: string;
  name: string;
  hex: string | null;
}

// Размер одной стороны фасада (или другой плоскости под покраску) — ширина
// и высота перемножаются в площадь на карточке/форме. windowsArea — площадь
// проёмов (окна/витражи) на этой стороне, вычитается из площади стены: под
// покраску нужна чистая площадь фасада, а не полная площадь стены с проёмами.
// Числа необязательны: пока замеров нет, строка живёт как шаблон-заготовка
// с пустыми полями.
export interface FacadeDimension {
  id: string;
  label: string;
  width: number | null;
  height: number | null;
  windowsArea: number | null;
}

// Структурированная позиция сметы — "Замена входных дверей" и т.п.: состав
// работ + референсы на конкретные товары. В отличие от EstimateSection.body
// (свободный текст) — жёсткая форма для позиций, где уже понятен состав
// полей. Разделы переводятся на позиции постепенно, по одному — старые
// разделы продолжают жить как body, пока до них не дойдёт очередь.
export interface EstimatePosition {
  id: string;
  title: string;
  // Состав работ — каждый пункт с новой строки, показывается списком под
  // вступительной фразой POSITION_OPS_INTRO + фиксированной оговоркой
  // POSITION_OPS_CATCHALL последним пунктом (см. EstimatePositionCard.tsx).
  ops: string[];
  products: EstimateProductRef[];
  // Оба поля ниже актуальны не для всех позиций (в основном для покраски) —
  // пустой массив по умолчанию, блок в карточке/форме просто не рисуется.
  colors: RalColor[];
  dimensions: FacadeDimension[];
}

export const POSITION_OPS_INTRO = 'Цена за работу включает следующие работы:';
export const POSITION_OPS_CATCHALL =
  'В том числе все прочие работы, предполагающие выполнение работы, но не включенные в перечень';

// Построчная (количественная) смета от подрядчика — вид работ с объёмом,
// единицей измерения и ценой работ/материалов за единицу; обычно приходит
// отдельным xlsx-просчётом по зонам (см. интеграцию 2026-08-27, смета
// Полтавская/Red One). В отличие от EstimatePosition (состав работ текстом
// + референсы товаров — для этапа "ещё не посчитано, только описываем
// ТЗ") — здесь уже есть конкретная стоимость по каждой строке. Раздел
// сметы может держать оба слоя одновременно: positions/body описывают, ЧТО
// делаем и зачем, lineItems — сколько это стоит по расчёту подрядчика.
// zone — исходная группа подрядчика (например, "1 этаж — Кабинеты"), если
// один раздел платформы объединяет несколько групп присланного файла —
// не участвует в расчётах, только для сверки с оригиналом.
// Комментарий к конкретной строке построчной сметы — свободный текст с
// датой, несколько на одну строку (см. EstimateLineItem.comments). В
// отличие от TransactionComment (data/transactionComments.ts, отдельная
// таблица Supabase) — здесь комментарии просто вложенный массив внутри
// самой строки: EstimateLineItem и так живёт в jsonb-колонке
// estimates.sections, отдельная таблица под комментарии тут не нужна —
// сохраняется тем же PATCH, что и остальные правки строки.
export interface EstimateLineItemComment {
  id: string;
  body: string;
  createdAt: string;
}

export interface EstimateLineItem {
  id: string;
  zone: string;
  workType: string;
  unit: string;
  length: number | null;
  width: number | null;
  height: number | null;
  volume: number | null;
  quantity: number | null;
  // Валюта, в которой заданы обе цены ниже (см. LINE_ITEM_CURRENCIES) — у
  // разных строк она может отличаться (подрядчик считал часть в BYN, часть
  // ориентировался на доллар), поэтому не единая на весь раздел/смету, а у
  // каждой строки своя. Для сложения строк в общий итог см. lineItemWorkTotalByn и т.п.
  currency: Currency;
  workUnitPrice: number | null;
  materialUnitPrice: number | null;
  note: string;
  comments: EstimateLineItemComment[];
  // "Можно сделать позже" — не убирает строку из таблицы (владелец явно
  // просил не прятать), только помечает, что её стоимость считается
  // отдельно от бюджета "сейчас" (см. EstimateCostSplitTotals). У раздела
  // есть свой отдельный флаг (EstimateSection.deferred) — раздел целиком
  // "на потом" перекрывает флаги отдельных строк (см. sectionLineItemsTotals).
  deferred: boolean;
}

export function lineItemWorkTotal(item: EstimateLineItem): number {
  return (item.quantity ?? 0) * (item.workUnitPrice ?? 0);
}

export function lineItemMaterialTotal(item: EstimateLineItem): number {
  return (item.quantity ?? 0) * (item.materialUnitPrice ?? 0);
}

export function lineItemTotal(item: EstimateLineItem): number {
  return lineItemWorkTotal(item) + lineItemMaterialTotal(item);
}

export interface EstimateCostTotals {
  work: number;
  material: number;
  total: number;
}

// "Сейчас" — строки, не отмеченные "можно позже" (и не в разделе,
// отмеченном "можно позже" целиком); "later" — всё остальное. Обе суммы
// всегда в BYN (конвертация построчная, каждая строка — по своей валюте) —
// null-конвертация (курс ещё не загружен) считается за 0, чтобы не уронить
// весь подсчёт, но реальные суммы в этот момент временно занижены.
export interface EstimateCostSplitTotals {
  now: EstimateCostTotals;
  later: EstimateCostTotals;
}

const zeroTotals: EstimateCostTotals = { work: 0, material: 0, total: 0 };
const zeroSplitTotals: EstimateCostSplitTotals = { now: zeroTotals, later: zeroTotals };

function addTotals(a: EstimateCostTotals, b: EstimateCostTotals): EstimateCostTotals {
  return { work: a.work + b.work, material: a.material + b.material, total: a.total + b.total };
}

export function sectionLineItemsTotals(
  section: Pick<EstimateSection, 'lineItems' | 'deferred'>,
  rate: ExchangeRate | null,
): EstimateCostSplitTotals {
  return section.lineItems.reduce((sum, item) => {
    const work = convertToByn(lineItemWorkTotal(item), item.currency, rate) ?? 0;
    const material = convertToByn(lineItemMaterialTotal(item), item.currency, rate) ?? 0;
    const itemTotals: EstimateCostTotals = { work, material, total: work + material };
    const isLater = section.deferred || item.deferred;
    return {
      now: isLater ? sum.now : addTotals(sum.now, itemTotals),
      later: isLater ? addTotals(sum.later, itemTotals) : sum.later,
    };
  }, zeroSplitTotals);
}

export function estimateLineItemsTotals(estimate: Pick<Estimate, 'sections'>, rate: ExchangeRate | null): EstimateCostSplitTotals {
  return estimate.sections.reduce((sum, s) => {
    const t = sectionLineItemsTotals(s, rate);
    return { now: addTotals(sum.now, t.now), later: addTotals(sum.later, t.later) };
  }, zeroSplitTotals);
}

// Позиция списка материалов — отдельно от EstimateLineItem: там цена
// (сколько это стоит по расчёту подрядчика), здесь — снабжение (что нужно
// закупить и сколько). Один материал может относиться сразу к нескольким
// строкам работ раздела, поэтому список не строка-в-строку с lineItems, а
// отдельный на весь раздел ("блок работ" целиком — так решил владелец).
export interface EstimateMaterial {
  id: string;
  name: string;
  unit: string;
  quantity: number | null;
  note: string;
}

export interface EstimateSection {
  id: string;
  title: string;
  body: string;
  positions: EstimatePosition[];
  lineItems: EstimateLineItem[];
  materials: EstimateMaterial[];
  // Счета и КП от поставщиков на материалы этого раздела — отдельно от
  // самого списка материалов (владелец специально просил "отдельно"): один
  // файл обычно перекрывает сразу несколько позиций списка, привязывать
  // каждый файл к одной конкретной строке было бы искусственно.
  materialFiles: DocumentFile[];
  // "Можно сделать позже" для раздела целиком — перекрывает такой же флаг
  // отдельных строк (см. EstimateLineItem.deferred и sectionLineItemsTotals):
  // раздел остаётся на экране как есть, просто вся его сумма считается в
  // "later", а не "now".
  deferred: boolean;
}

export interface EstimateQuestion {
  id: string;
  text: string;
  resolved: boolean;
}

// Открытый список, как leadStatuses/financingStatuses — растёт из формы
// через AddableSelect (см. EstimateDetail.tsx), это просто стартовое
// значение для новых смет.
export const estimateStatuses = ['В работе'] as const;

export interface Estimate {
  id: string;
  objectId: string;
  sections: EstimateSection[];
  questions: EstimateQuestion[];
  status: string;
  // Токен публичной ссылки на построчную смету (/estimate/:token) — на
  // редактирование, не на просмотр (см. EstimatePublicPage.tsx). Генерится
  // в базе автоматически при создании, в форме не редактируется.
  shareToken: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/estimatesApi.ts
export interface EstimateRow {
  id: string;
  object_id: string;
  sections: EstimateSection[] | null;
  questions: EstimateQuestion[] | null;
  status: string;
  share_token: string;
  created_at: string;
}

// Стартовый набор разделов для новой сметы — по мере работы разделы можно
// переименовывать, удалять и добавлять свои прямо на странице сметы.
export function emptySection(title: string): EstimateSection {
  return {
    id: crypto.randomUUID(),
    title,
    body: '',
    positions: [],
    lineItems: [],
    materials: [],
    materialFiles: [],
    deferred: false,
  };
}

export function defaultEstimateSections(): EstimateSection[] {
  return [
    emptySection('Фасад'),
    emptySection('Кабинеты'),
    emptySection('Общие зоны'),
    emptySection('Организация и логистика'),
  ];
}
