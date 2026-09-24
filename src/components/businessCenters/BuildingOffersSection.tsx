import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { pluralRu } from '../../lib/pluralRu';
import type { RetailVacancyEntry } from '../../data/businessCenters';
import type { DedupedOffer } from '../../lib/businessCenterOfferDuplicates';
import {
  buildPriceBuckets,
  formatArea,
  formatAreaValue,
  formatMoney,
  formatRate,
  type DealStats,
  type DealType,
} from '../../lib/businessCenterOfferStats';

// Блок «Что сейчас сдают и продают в здании».
//
// Три захода, все по замечаниям владельца.
//
// 1. До 2026-09-21 здесь была таблица «тип помещения × диапазон цены»:
//    «Офисы | 5 | 27,9–345 м² | $1 364–$2 065/м² (медиана $2 000)».
//    Владелец: «вроде таблица, вроде всё ок, но читается отвратительно».
//    Данных на таблицу не набиралось (две строки, в обеих слово «Офисы»),
//    диапазон прятал закономерность (метр в мелком помещении дороже, чем
//    в целом этаже), а бюджета покупки и платежа в месяц не было вовсе.
//
// 2. Первая замена — плитки с медианами, процентами к срезам рынка и
//    таблицами на четыре колонки — оказалась не проще, а сложнее:
//    «прям овер сложно воспринимать инфу, нужно упрощать, чтобы поняла
//    домохозяйка». Отсюда правила, которые держатся до сих пор:
//      • ни «медианы», ни «лотов» — «помещения» и «в среднем»;
//      • главное число строки — цена помещения ЦЕЛИКОМ, а не за метр;
//        цена за метр остаётся подписью, она нужна только тем, кто
//        сравнивает здания между собой;
//      • шапок таблицы нет: «28 м², 7 этаж — $57 600» читается и без них;
//      • ни строки «чем больше помещение, тем дешевле метр», ни подписи
//        про источники и платежи: владелец убрал и то и другое
//        2026-09-21 — а откуда данные, сказано в «Источниках» в конце
//        страницы;
//      • сравнения с рынком тут нет совсем: параллельно оно переехало в
//        соседний блок «Цены в здании и по рынку»
//        (lib/businessCenterPriceCompare), а два разных сравнения одного
//        и того же на одном экране хуже любого из них.
//    Подробные цифры (крайние ставки, разбивка по типам) никуда не делись
//    — они в FAQ под блоком.
//
// 3. 2026-09-22, владелец о получившемся списке: «уже норм, но не вау».
//    Настоящая причина обнаружилась в данных, а не в оформлении: список
//    сортировался по площади, поэтому первый экран занимали самые мелкие
//    лоты, и подряд стояли «5,7 м² — $5 945» и «5,7 м² — $22 500».
//    Читатель видит не «дорого/дёшево», а «сайт врёт». Поэтому лоты
//    разложены по полкам с бюджетом (buildPriceBuckets): человек приходит
//    не с площадью, а с суммой, а внутри одной полки цены сопоставимы
//    между собой. Сразу открыта первая, самая дешёвая полка, в ней первые
//    шесть помещений.
//    Под заголовком полки была красная полоска с долей помещений в этой
//    цене. Владелец, 2026-09-22, спросил, что она значит, — и этим всё
//    сказал: доля уже написана рядом словами («8 помещений»), а полоска
//    требовала расшифровки. Убрана.
//    Внутри полки помещения идут от меньшей цены к большей (сортировка в
//    buildDealStats). По площади они сортировались с самого начала, и в
//    полке это давало «$22 500, $19 900, $28 900, $31 500» — владелец:
//    «сейчас они вразнобой». Выбирают всё равно по цене.
//
// 4. Окупаемости покупки арендой здесь нет и не должно быть, хотя данные
//    на неё есть. Считать её честно не на чем: в здании продают одни
//    помещения, а сдают другие, и цена метра у мелкого кабинета и целого
//    этажа отличается в полтора раза. Замер по базе: расчёт «медиана
//    продажи ÷ медиана аренды» расходится с расчётом по сопоставимым
//    площадям в среднем на 1,5 года, а на «Центрополе» — на 8,9 года
//    (5,6 против 14,6). Владелец, 2026-09-21, после разбора методики:
//    «давай не считать окупаемость вообще».

// Сколько помещений показывать в открытой полке сразу. Шесть — примерно
// экран на телефоне; остальное прячется за кнопкой.
const VISIBLE_LOTS = 6;

const DEAL_TITLE: Record<DealType, string> = { sale: 'Продают', rent: 'Сдают' };

function roomsCount(n: number): string {
  return `${n} ${pluralRu(n, 'помещение', 'помещения', 'помещений')}`;
}

// Тип помещения в единственном числе — нужен ровно в одном месте: когда в
// здании сдаётся или продаётся единственное помещение и оно описывается
// строкой «офис 23,5 м², 3 этаж». Во множественном («Офисы») такая
// строка читается как опечатка. Набор типов закрытый — их шесть на все
// 1 544 объявления; незнакомый оставляем как есть, а «Без категории» в
// строку не попадает вовсе, потому что ничего не сообщает.
const SINGULAR_TYPE: Record<string, string | null> = {
  Офисы: 'офис',
  'Торговые помещения': 'торговое помещение',
  'Сфера услуг': 'помещение сферы услуг',
  Кладовые: 'кладовая',
  Общепит: 'общепит',
  'Без категории': null,
};

function singularType(type: string | null): string | null {
  if (!type) return null;
  return type in SINGULAR_TYPE ? SINGULAR_TYPE[type] : type;
}

function LotRow({ lot, deal, showType }: { lot: DedupedOffer; deal: DealType; showType: boolean }) {
  const isRent = deal === 'rent';
  // Этаж информативнее типа, поэтому при наличии обоих подписывается он:
  // вторая строка в ряду — это уже мелкий шрифт под мелким шрифтом.
  const sub = lot.floor != null ? `${lot.floor} этаж` : showType ? (lot.propertyType ?? 'Без категории') : null;

  return (
    <li className="flex items-baseline justify-between gap-3 border-t border-border py-2.5 first:border-t-0">
      <span className="min-w-0 text-sm text-ink">
        {formatArea(lot.size)}
        {sub && <span className="block text-xs text-ink-faint">{sub}</span>}
      </span>
      <span className="shrink-0 text-right">
        <span className="block whitespace-nowrap text-sm font-bold tabular-nums text-ink">
          {formatMoney(lot.size * lot.pricePerSqm)}
          {isRent && <span className="font-semibold text-ink-muted"> / мес</span>}
        </span>
        <span className="block whitespace-nowrap text-xs text-ink-faint">
          {formatRate(lot.pricePerSqm, deal)} за м²
        </span>
      </span>
    </li>
  );
}

function DealColumn({ stats }: { stats: DealStats }) {
  const buckets = useMemo(() => buildPriceBuckets(stats), [stats]);
  // Открыта ПЕРВАЯ полка — самая дешёвая. Сначала открывалась самая
  // густая, и владелец, 2026-09-22: «странно, что в левом блоке по
  // умолчанию раскрывается второй блок, пусть будет первый». Он прав:
  // угадывать, какая полка интереснее, блок не может, а порядок сверху
  // вниз читатель видит сам.
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [showAll, setShowAll] = useState(false);
  const isRent = stats.deal === 'rent';
  // Тип помещения подписывается, только когда их правда несколько: в
  // здании с одними офисами это слово повторялось бы в каждой строке.
  const showType = stats.propertyTypes.length > 1;

  const openBucket = (idx: number) => {
    setOpenIdx((prev) => (prev === idx ? null : idx));
    setShowAll(false);
  };

  // «от $597 до $597» — так выглядел диапазон, посчитанный по одному лоту
  // (владелец, 2026-09-22: «смотрится кринж»). Когда цена одна, её и
  // показываем одним числом; при единственном помещении список под ней
  // тоже не нужен — он повторял бы ту же цену второй раз.
  const perMonth = isRent && <span className="text-base font-bold text-ink-muted"> в месяц</span>;
  const priceLine =
    stats.totalMin === stats.totalMax ? (
      <>
        {stats.count > 1 && 'все по '}
        {formatMoney(stats.totalMin)}
        {perMonth}
      </>
    ) : (
      <>
        от {formatMoney(stats.totalMin)} до {formatMoney(stats.totalMax)}
        {perMonth}
      </>
    );

  const header = (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {DEAL_TITLE[stats.deal]} {roomsCount(stats.count)}
      </span>
      <span className="text-xl font-extrabold leading-tight text-ink">{priceLine}</span>
    </div>
  );

  if (stats.count === 1) {
    const lot = stats.lots[0];
    // Про одно помещение известно четыре вещи — цена, площадь, этаж и
    // ставка за метр. Сначала они лежали строками в рамке, и владелец,
    // 2026-09-22: «неуклюже выглядит, куча строк, разные шрифты, а
    // информации по сути не так много». Теперь это одна серая строка под
    // ценой, а рамки нет: обрамлять нечего, внутри одна фраза. Заодно
    // строки помещений стали одинаковыми во всём блоке — рамка осталась
    // только у полки, где она отделяет одну цену от другой.
    const facts = [
      singularType(lot.propertyType),
      formatArea(lot.size),
      lot.floor != null ? `${lot.floor} этаж` : null,
    ].filter((v): v is string => v !== null);

    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        {header}
        <p className="text-sm text-ink-muted">
          {facts.join(', ')} · {formatRate(lot.pricePerSqm, stats.deal)} за м²
        </p>
      </div>
    );
  }

  // Меньше семи помещений помещаются на экран целиком — полки для них
  // лишний клик на ровном месте. Но рамка у списка та же, что у раскрытой
  // полки: без неё здания с полками и здания без них выглядели как два
  // разных блока (владелец, 2026-09-22: «я бы оформлял так же, в
  // прямоугольную закруглённую рамку, даже обычные текущие таблицы»).
  if (!buckets) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {header}
        <ul className="flex flex-col rounded-2xl border border-border-strong bg-surface-muted px-4 py-1.5">
          {stats.lots.map((lot) => (
            <LotRow key={lot.id} lot={lot} deal={stats.deal} showType={showType} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {header}

      <div className="flex flex-col gap-2">
        {buckets.map((bucket, idx) => {
          const open = openIdx === idx;
          const visible = open && !showAll ? bucket.lots.slice(0, VISIBLE_LOTS) : bucket.lots;
          return (
            <div
              key={bucket.label}
              className={cn(
                'rounded-2xl border px-4 py-3 transition-colors',
                open ? 'border-border-strong bg-surface-muted' : 'border-border',
              )}
            >
              <button
                type="button"
                onClick={() => openBucket(idx)}
                aria-expanded={open}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-base font-extrabold text-ink">{bucket.label}</span>
                  <span className="block text-xs text-ink-muted">
                    площадь{' '}
                    {bucket.sizeMin === bucket.sizeMax
                      ? formatArea(bucket.sizeMax)
                      : `${formatAreaValue(bucket.sizeMin)} – ${formatArea(bucket.sizeMax)}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 pt-0.5 text-xs font-semibold text-ink-muted">
                  {roomsCount(bucket.lots.length)}
                  <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
                </span>
              </button>

              {open && (
                <>
                  <ul className="mt-3 flex flex-col border-t border-border-strong pt-0.5">
                    {visible.map((lot) => (
                      <LotRow key={lot.id} lot={lot} deal={stats.deal} showType={showType} />
                    ))}
                  </ul>
                  {bucket.lots.length > VISIBLE_LOTS && (
                    <button
                      type="button"
                      onClick={() => setShowAll((v) => !v)}
                      className="mt-2 text-xs font-semibold text-primary hover:text-primary-hover"
                    >
                      {showAll ? 'Свернуть' : `Показать все ${roomsCount(bucket.lots.length)} в этой цене`}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Уровень так, как его пишет ТЦ: «−1» → «−1 этаж», «верхний уровень» — как есть.
function vacancyFloor(floor: string | null): string | null {
  if (!floor) return null;
  return /^[-−]?\d+$/.test(floor) ? `${floor.replace('-', '−')} этаж` : floor;
}

// Помещения из списка самого ТЦ (retail_info.vacancies). Владелец,
// 2026-09-24, выбрал показывать их «списком» под объявлениями: у крупных ТЦ
// отдел аренды почти никогда не публикует цену, а полки по бюджету без цены
// не построить. Поэтому здесь простой список: площадь, этаж, тип — и цена,
// только если ТЦ её назвал.
function ListedColumn({ lots }: { lots: RetailVacancyEntry[] }) {
  const sorted = [...lots].sort((a, b) => a.size - b.size);
  // Ссылка — на страницу самого ТЦ; объявления площадок в список тоже
  // попадают (синк их не нашёл по адресу), но «сайтом ТЦ» они не являются.
  const sourceUrl =
    lots.find((l) => l.sourceUrl && !/kufar|realt|domovita|onliner|megapolis/i.test(l.sourceUrl))?.sourceUrl ?? null;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Свободно по данным ТЦ: {roomsCount(lots.length)}
        </span>
        <span className="text-xl font-extrabold leading-tight text-ink">
          {sorted.length > 1 && sorted[0].size !== sorted[sorted.length - 1].size
            ? `от ${formatAreaValue(sorted[0].size)} до ${formatArea(sorted[sorted.length - 1].size)}`
            : formatArea(sorted[0].size)}
        </span>
      </div>
      <ul className="flex flex-col rounded-2xl border border-border-strong bg-surface-muted px-4 py-1.5">
        {sorted.map((lot, idx) => {
          const sub = [vacancyFloor(lot.floor), lot.type].filter(Boolean).join(', ');
          return (
            <li
              key={`${lot.size}-${lot.floor}-${idx}`}
              className="flex items-baseline justify-between gap-3 border-t border-border py-2.5 first:border-t-0"
            >
              <span className="min-w-0 text-sm text-ink">
                {formatArea(lot.size)}
                {sub && <span className="block text-xs text-ink-faint">{sub}</span>}
              </span>
              <span className="shrink-0 text-right text-sm">
                {lot.pricePerSqm != null ? (
                  <>
                    <span className="block whitespace-nowrap font-bold tabular-nums text-ink">
                      {formatMoney(lot.size * lot.pricePerSqm)}
                      {lot.deal === 'rent' && <span className="font-semibold text-ink-muted"> / мес</span>}
                    </span>
                    <span className="block whitespace-nowrap text-xs text-ink-faint">
                      {formatRate(lot.pricePerSqm, lot.deal)} за м²
                    </span>
                  </>
                ) : (
                  <span className="whitespace-nowrap text-xs text-ink-muted">цена по запросу</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-xs font-semibold text-primary hover:text-primary-hover"
        >
          Список на сайте ТЦ
        </a>
      )}
    </div>
  );
}

export function BuildingOffersSection({
  sale,
  rent,
  listed = [],
}: {
  sale: DealStats | null;
  rent: DealStats | null;
  listed?: RetailVacancyEntry[];
}) {
  if (!sale && !rent && !listed.length) return null;
  const columns = [sale, rent].filter((s): s is DealStats => s !== null);
  const count = columns.length + (listed.length ? 1 : 0);

  return (
    <div id="offers" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="text-lg font-bold text-ink">Что сейчас сдают и продают в здании</h2>

      <div className={cn('grid items-start gap-6', count > 1 ? 'md:grid-cols-2' : 'max-w-xl')}>
        {columns.map((stats) => (
          <DealColumn key={stats.deal} stats={stats} />
        ))}
        {listed.length > 0 && <ListedColumn lots={listed} />}
      </div>
    </div>
  );
}
