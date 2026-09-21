import { useState } from 'react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import {
  formatArea,
  formatAreaRange,
  formatLotsCount,
  formatLotsDative,
  formatMoney,
  formatPercent,
  formatRate,
  formatYears,
  type DealStats,
  type DealType,
  type YieldStats,
} from '../../lib/businessCenterOfferStats';

// Блок «Что сейчас сдают и продают в здании».
//
// До 2026-09-21 здесь была одна таблица на четыре колонки со строками по
// типу помещения: «Офисы | 5 | 27,9–345 м² | $1 364–$2 065/м² (медиана
// $2 000)». Владелец: «вроде таблица, вроде всё ок, но читается
// отвратительно». Разбор показал, что дело не в вёрстке:
//   • данных на таблицу не набиралось — две строки, в обеих одно и то же
//     слово «Офисы», а «Продажа»/«Аренда» были не данными, а подзаголовками;
//   • диапазон цены прятал закономерность вместо того, чтобы её показать
//     (метр в мелком лоте дороже, чем в целом этаже, — см. sizeDiscount);
//   • ставки за метр мало: человек считает бюджетом покупки и платежом в
//     месяц, а их на странице не было вовсе.
// Теперь на сделку приходится плитка с главным числом и таблица самих
// лотов, а из пары «цена продажи × ставка аренды» считается окупаемость —
// её больше никто по зданию не считает, потому что ни у Kufar, ни у Realt
// здание не является сущностью.

// Сколько лотов показывать сразу. Шесть — примерно экран на телефоне; у
// зданий с сорока лотами остальное прячется за кнопкой.
const VISIBLE_LOTS = 6;

const DEAL_TITLE: Record<DealType, string> = { sale: 'Продажа', rent: 'Аренда' };

// Сравнения со срезом рынка тут больше нет: с 2026-09-21 оно целиком
// живёт в блоке «Цены в здании и по рынку» сразу под этой карточкой
// (владелец видел оба варианта рядом и выбрал плитки). Две разные подачи
// одного и того же сравнения на одном экране — хуже любой из них.
function DealTile({ stats }: { stats: DealStats }) {
  const isRent = stats.deal === 'rent';
  return (
    <div className="flex flex-col gap-1 border-b border-border pb-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{DEAL_TITLE[stats.deal]}</span>
      <span className="text-2xl font-extrabold leading-tight text-ink">
        {formatRate(stats.median, stats.deal)}
        <span className="text-base font-bold text-ink-muted">/м²{isRent ? ' в месяц' : ''}</span>
      </span>
      <span className="text-xs text-ink-faint">
        {stats.propertyTypes.length > 1
          ? `медиана — по лотам категории «${stats.priceType}» (${stats.priceLots.length} из ${stats.count})`
          : `медиана по ${formatLotsDative(stats.count)}`}
      </span>
      <span className="mt-1 text-sm text-ink">
        {isRent ? 'Платёж' : 'Бюджет'} {formatMoney(stats.totalMin)}–{formatMoney(stats.totalMax)}
        {isRent ? ' в месяц' : ''}
      </span>
      <span className="text-xs text-ink-faint">площади {formatAreaRange(stats.sizeMin, stats.sizeMax)}</span>
    </div>
  );
}

function LotsTable({ stats }: { stats: DealStats }) {
  const [expanded, setExpanded] = useState(false);
  const isRent = stats.deal === 'rent';
  const visible = expanded ? stats.lots : stats.lots.slice(0, VISIBLE_LOTS);
  // Колонка с типом помещения появляется, только когда типов правда
  // несколько: в здании с одними офисами она повторяла бы одно слово
  // столько раз, сколько лотов, — ровно то, с чего начался разбор.
  const showType = stats.propertyTypes.length > 1;
  const showFloor = stats.lots.some((lot) => lot.floor != null);

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-ink-faint">
            <th scope="col" className="py-1.5 pr-2 text-left">
              Площадь
            </th>
            {showType && (
              <th scope="col" className="hidden py-1.5 px-2 text-left sm:table-cell">
                Тип
              </th>
            )}
            {showFloor && (
              <th scope="col" className="py-1.5 px-2 text-right">
                Этаж
              </th>
            )}
            <th scope="col" className="py-1.5 px-2 text-right">
              За м²
            </th>
            <th scope="col" className="py-1.5 pl-2 text-right">
              {isRent ? 'В месяц' : 'Стоимость'}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {visible.map((lot) => (
            <tr key={lot.id}>
              <th scope="row" className="whitespace-nowrap py-2 pr-2 text-left font-medium tabular-nums text-ink">
                {formatArea(lot.size)}
                {/* На узком экране пятая колонка не помещается и таблица
                    обрезается по правому краю — тип уходит подписью под
                    площадь, а колонка остаётся только с sm. */}
                {showType && (
                  <span className="block text-xs font-normal text-ink-faint sm:hidden">
                    {lot.propertyType ?? 'Без категории'}
                  </span>
                )}
              </th>
              {showType && (
                <td className="hidden py-2 px-2 text-ink-muted sm:table-cell">{lot.propertyType ?? 'Без категории'}</td>
              )}
              {showFloor && (
                <td className="py-2 px-2 text-right tabular-nums text-ink-muted">{lot.floor != null ? lot.floor : '—'}</td>
              )}
              <td className="whitespace-nowrap py-2 px-2 text-right tabular-nums text-ink-muted">
                {formatRate(lot.pricePerSqm, stats.deal)}
              </td>
              <td className="whitespace-nowrap py-2 pl-2 text-right font-semibold tabular-nums text-ink">
                {formatMoney(lot.size * lot.pricePerSqm)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {stats.lots.length > VISIBLE_LOTS && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-xs font-semibold text-primary hover:text-primary-hover"
        >
          {expanded ? 'Свернуть' : `Показать все ${formatLotsCount(stats.lots.length)}`}
        </button>
      )}
    </div>
  );
}

function DealColumn({ stats }: { stats: DealStats }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <DealTile stats={stats} />
      <LotsTable stats={stats} />
      {stats.sizeDiscount && (
        <p className="text-xs text-ink-muted">
          Чем крупнее лот, тем дешевле метр: {formatArea(stats.sizeDiscount.smallSize)} —{' '}
          {formatRate(stats.sizeDiscount.smallPrice, stats.deal)}/м², {formatArea(stats.sizeDiscount.largeSize)} —{' '}
          {formatRate(stats.sizeDiscount.largePrice, stats.deal)}/м², разница {Math.round(stats.sizeDiscount.dropPct)}%.
        </p>
      )}
    </div>
  );
}

function YieldTile({ stats }: { stats: YieldStats }) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-border p-4 sm:flex-row sm:items-baseline sm:gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Окупаемость арендой</span>
        <span className="text-2xl font-extrabold leading-tight text-ink">{formatYears(stats.paybackYears)}</span>
      </div>
      <p className="text-sm text-ink-muted">
        {formatPercent(stats.grossYieldPct)} годовых до расходов: купить по {formatRate(stats.salePricePerSqm, 'sale')}/м²
        и сдавать по {formatRate(stats.rentPricePerSqm, 'rent')}/м² в месяц. Считается по медианам
        {stats.propertyType === 'Офисы' ? ' офисных лотов' : ` лотов «${stats.propertyType.toLowerCase()}»`} этого
        здания, без учёта простоя, налогов и эксплуатационных платежей.
      </p>
    </div>
  );
}

// Короткий ответ на вопрос «что тут вообще можно сделать с деньгами» —
// первое, что читается в блоке, дальше идут подробности.
function leadSentences(sale: DealStats | null, rent: DealStats | null): string {
  const parts: string[] = [];
  if (sale) {
    const cheapest = [...sale.lots].sort((a, b) => a.size * a.pricePerSqm - b.size * b.pricePerSqm)[0];
    parts.push(
      `Купить — от ${formatMoney(cheapest.size * cheapest.pricePerSqm)} за ${formatArea(cheapest.size)}, всего ${formatLotsCount(sale.count)}.`,
    );
  }
  if (rent) {
    const cheapest = [...rent.lots].sort((a, b) => a.size * a.pricePerSqm - b.size * b.pricePerSqm)[0];
    parts.push(
      `Снять — от ${formatMoney(cheapest.size * cheapest.pricePerSqm)} в месяц за ${formatArea(cheapest.size)}, всего ${formatLotsCount(rent.count)}.`,
    );
  }
  return parts.join(' ');
}

export function BuildingOffersSection({
  sale,
  rent,
  yieldStats,
}: {
  sale: DealStats | null;
  rent: DealStats | null;
  yieldStats: YieldStats | null;
}) {
  if (!sale && !rent) return null;
  const columns = [sale, rent].filter((s): s is DealStats => s !== null);

  return (
    <div id="offers" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-ink">Что сейчас сдают и продают в здании</h2>
        <p className="text-sm text-ink-muted">{leadSentences(sale, rent)}</p>
      </div>

      {yieldStats && <YieldTile stats={yieldStats} />}

      <div className={cn('grid items-start gap-6', columns.length > 1 ? 'md:grid-cols-2' : 'max-w-xl')}>
        {columns.map((stats) => (
          <DealColumn key={stats.deal} stats={stats} />
        ))}
      </div>

      <p className="text-xs text-ink-faint">
        Стоимость лота — площадь × ставка объявления: состав коммунальных, эксплуатационных и других платежей в
        объявлениях не раскрыт. Один и тот же лот, выложенный сразу на нескольких площадках, считается одним.
      </p>
    </div>
  );
}
