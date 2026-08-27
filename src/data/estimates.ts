import type { DocumentFile } from './contractorDocuments';

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
  workUnitPrice: number | null;
  materialUnitPrice: number | null;
  note: string;
  comments: EstimateLineItemComment[];
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

const zeroTotals: EstimateCostTotals = { work: 0, material: 0, total: 0 };

export function sectionLineItemsTotals(section: Pick<EstimateSection, 'lineItems'>): EstimateCostTotals {
  return section.lineItems.reduce(
    (sum, item) => ({
      work: sum.work + lineItemWorkTotal(item),
      material: sum.material + lineItemMaterialTotal(item),
      total: sum.total + lineItemTotal(item),
    }),
    zeroTotals,
  );
}

export function estimateLineItemsTotals(estimate: Pick<Estimate, 'sections'>): EstimateCostTotals {
  return estimate.sections.reduce((sum, s) => {
    const t = sectionLineItemsTotals(s);
    return { work: sum.work + t.work, material: sum.material + t.material, total: sum.total + t.total };
  }, zeroTotals);
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
export function defaultEstimateSections(): EstimateSection[] {
  return [
    { id: crypto.randomUUID(), title: 'Фасад', body: '', positions: [], lineItems: [], materials: [], materialFiles: [] },
    { id: crypto.randomUUID(), title: 'Кабинеты', body: '', positions: [], lineItems: [], materials: [], materialFiles: [] },
    { id: crypto.randomUUID(), title: 'Общие зоны', body: '', positions: [], lineItems: [], materials: [], materialFiles: [] },
    {
      id: crypto.randomUUID(),
      title: 'Организация и логистика',
      body: '',
      positions: [],
      lineItems: [],
      materials: [],
      materialFiles: [],
    },
  ];
}
