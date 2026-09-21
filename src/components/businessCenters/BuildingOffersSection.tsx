import { useState } from 'react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { pluralRu } from '../../lib/pluralRu';
import { formatArea, formatMoney, formatRate, type DealStats, type DealType } from '../../lib/businessCenterOfferStats';

// Блок «Что сейчас сдают и продают в здании».
//
// Два захода за один день, оба по замечанию владельца.
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
//    домохозяйка». Отсюда нынешний вид, и правила у него простые:
//      • ни «медианы», ни «лотов» — «помещения» и «в среднем»;
//      • главное число строки — цена помещения ЦЕЛИКОМ, а не за метр;
//        цена за метр остаётся подписью, она нужна только тем, кто
//        сравнивает здания между собой;
//      • шапок таблицы нет: «28 м², 7 этаж — $57 600» читается и без них;
//      • ни строки «чем больше помещение, тем дешевле метр», ни подписи
//        про источники и платежи: владелец убрал и то и другое
//        2026-09-21 — в блоке остаются только сами помещения с ценами,
//        а откуда данные, сказано в «Источниках» в конце страницы;
//      • сравнения с рынком тут нет совсем: параллельно оно переехало в
//        соседний блок «Цены в здании и по рынку»
//        (lib/businessCenterPriceCompare), а два разных сравнения одного
//        и того же на одном экране хуже любого из них;
//    Подробные цифры (крайние ставки, разбивка по типам) никуда не делись
//    — они в FAQ под блоком.
//
// 3. Окупаемости покупки арендой здесь нет и не должно быть, хотя данные
//    на неё есть. Считать её честно не на чем: в здании продают одни
//    помещения, а сдают другие, и цена метра у мелкого кабинета и целого
//    этажа отличается в полтора раза. Замер по базе: расчёт «медиана
//    продажи ÷ медиана аренды» расходится с расчётом по сопоставимым
//    площадям в среднем на 1,5 года, а на «Центрополе» — на 8,9 года
//    (5,6 против 14,6). Владелец, 2026-09-21, после разбора методики:
//    «давай не считать окупаемость вообще».

// Сколько помещений показывать сразу. Шесть — примерно экран на телефоне;
// у зданий с сорока объявлениями остальное прячется за кнопкой.
const VISIBLE_LOTS = 6;

const DEAL_TITLE: Record<DealType, string> = { sale: 'Продают', rent: 'Сдают' };

function roomsCount(n: number): string {
  return `${n} ${pluralRu(n, 'помещение', 'помещения', 'помещений')}`;
}

function DealColumn({ stats }: { stats: DealStats }) {
  const [expanded, setExpanded] = useState(false);
  const isRent = stats.deal === 'rent';
  const visible = expanded ? stats.lots : stats.lots.slice(0, VISIBLE_LOTS);
  // Тип помещения подписывается, только когда их правда несколько: в
  // здании с одними офисами это слово повторялось бы в каждой строке.
  const showType = stats.propertyTypes.length > 1;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          {DEAL_TITLE[stats.deal]} {roomsCount(stats.count)}
        </span>
        <span className="text-xl font-extrabold leading-tight text-ink">
          от {formatMoney(stats.totalMin)} до {formatMoney(stats.totalMax)}
          {isRent && <span className="text-base font-bold text-ink-muted"> в месяц</span>}
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-border border-t border-border">
        {visible.map((lot) => (
          <li key={lot.id} className="flex items-baseline justify-between gap-3 py-2.5">
            <span className="min-w-0 text-sm text-ink">
              {formatArea(lot.size)}
              {lot.floor != null && <span className="text-ink-muted">, {lot.floor} этаж</span>}
              {showType && (
                <span className="block text-xs text-ink-faint">{lot.propertyType ?? 'Без категории'}</span>
              )}
            </span>
            <span className="shrink-0 text-right">
              <span className="block whitespace-nowrap text-sm font-bold tabular-nums text-ink">
                {formatMoney(lot.size * lot.pricePerSqm)}
                {isRent && <span className="font-semibold text-ink-muted"> / мес</span>}
              </span>
              <span className="block whitespace-nowrap text-xs text-ink-faint">
                {formatRate(lot.pricePerSqm, stats.deal)} за м²
              </span>
            </span>
          </li>
        ))}
      </ul>

      {stats.lots.length > VISIBLE_LOTS && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-xs font-semibold text-primary hover:text-primary-hover"
        >
          {expanded ? 'Свернуть' : `Показать все ${roomsCount(stats.lots.length)}`}
        </button>
      )}
    </div>
  );
}

export function BuildingOffersSection({ sale, rent }: { sale: DealStats | null; rent: DealStats | null }) {
  if (!sale && !rent) return null;
  const columns = [sale, rent].filter((s): s is DealStats => s !== null);

  return (
    <div id="offers" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="text-lg font-bold text-ink">Что сейчас сдают и продают в здании</h2>

      <div className={cn('grid items-start gap-6', columns.length > 1 ? 'md:grid-cols-2' : 'max-w-xl')}>
        {columns.map((stats) => (
          <DealColumn key={stats.deal} stats={stats} />
        ))}
      </div>
    </div>
  );
}
