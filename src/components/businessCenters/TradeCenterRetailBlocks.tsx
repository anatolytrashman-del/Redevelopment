// Торговые блоки карточки ТЦ (2026-09-23): «Путеводитель по ТЦ» (этажи +
// каталог арендаторов слиты в один блок, владелец, 2026-09-25 —
// TradeCenterGuide.tsx), «Чем ТЦ вошёл в историю ритейла», «Где поесть» и
// «Развлечения» (2026-09-24,
// TradeCenterFoodFun.tsx; у ТЦ без retail_info.food/fun вместо них — старый
// «Кино, еда, развлечения»); за ними — проезд, скидки и события,
// «Реклама в ТЦ», «ТЦ в цифрах» и «Цитаты»
// (TradeCenterExtraBlocks.tsx), последними — «Якорные арендаторы»
// (2026-09-24: старая карточка «Первые в Беларуси и якоря» разделена на эти
// два блока, см. TradeCenterAnchorsHistory.tsx). Данные —
// business_centers.retail_info (у БЦ пусто, компонент не рисует ничего). Каждая карточка — только если по ней есть записи.
//
// Места в рейтингах до 2026-09-24 были жёлтыми плашками в первой из этих
// карточек; владелец: «смешал две сущности — что на каком этаже и
// награды». Теперь это отдельный блок «Награды и рейтинги»
// (TradeCenterAwardsBlock.tsx), он стоит на месте блока «Награды».
//
// `after` — место для блока-рекомендации после карточки (как
// renderRecommendationSlot у остальных блоков страницы): раскладка
// рекомендаций видит эти карточки как отдельные разделы.
import { useEffect, useState, type ReactNode } from 'react';
import { Baby, Clapperboard, Dumbbell, Sparkles, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { RetailInfo, RetailLeisureKind } from '../../data/businessCenters';
import type { TenantOrganizationView } from '../../data/businessCenterTenants';
import {
  LEISURE_KIND_LABELS,
  anchorsForPage,
  foodTitle,
  funTitle,
  leisureForPage,
  retailHistoryTitle,
  retailSectionIds,
  sortLeisure,
  type RetailSectionId,
} from '../../lib/tradeCenterRetail';
import { RetailCardTitle as CardTitle } from './TradeCenterRetailParts';
import { retailCardClass as cardClass } from './tradeCenterRetailStyle';
import { glassCardShadow } from '../../lib/glass';
import { TradeCenterGuide } from './TradeCenterGuide';
import { loadBcExtra, peekBcExtra, type BcExtraFile } from '../../lib/buildData';
import {
  TradeCenterQuotesCard,
} from './TradeCenterExtraBlocks';
import { TradeCenterNumbersCard } from './TradeCenterNumbers';
import { TradeCenterAnchorsCard, TradeCenterHistoryCard } from './TradeCenterAnchorsHistory';
import { TradeCenterGettingHere, TradeCenterOffersEvents } from './TradeCenterVisit';
import { TradeCenterAdvertising } from './TradeCenterBusiness';
import { TradeCenterFoodCard, TradeCenterFunCard } from './TradeCenterFoodFun';

const LEISURE_ICONS: Record<RetailLeisureKind, LucideIcon> = {
  cinema: Clapperboard,
  food: UtensilsCrossed,
  kids: Baby,
  sport: Dumbbell,
  other: Sparkles,
};

export function TradeCenterRetailBlocks({
  info,
  name,
  contactName,
  organizations,
  slug,
  after,
}: {
  info: RetailInfo | null;
  slug: string;
  /** Имя в заголовке ленты: «ТЦ «Замок»». */
  name: string;
  contactName: string;
  /** Каталог арендаторов — с 2026-09-25 живёт внутри «Путеводителя», не отдельным блоком. */
  organizations: TenantOrganizationView[];
  after?: (id: RetailSectionId) => ReactNode;
}) {
  const [extra, setExtra] = useState<{ slug: string; data: BcExtraFile | null }>(() => ({ slug, data: peekBcExtra(slug) }));
  useEffect(() => {
    let cancelled = false;
    // Только файл сборки: уникальность требует снимков всех ТЦ (владелец, 2026-09-25).
    void loadBcExtra(slug).then((data) => { if (!cancelled) setExtra({ slug, data }); });
    return () => { cancelled = true; };
  }, [slug]);
  const uniqueBrands = extra.slug === slug ? extra.data?.uniqueBrands : undefined;
  if (!info) return <TradeCenterGuide key={slug} info={null} organizations={organizations} name={name} uniqueBrands={uniqueBrands} />;
  const ids = retailSectionIds(info, organizations.length > 0);

  // Старый досуг — только у ТЦ без «Где поесть»/«Развлечений».
  const leisure = sortLeisure(leisureForPage(info));

  return (
    <>
      {ids.includes('floors') && <TradeCenterGuide key={slug} info={info} organizations={organizations} name={name} uniqueBrands={uniqueBrands} />}
      {ids.includes('floors') && after?.('floors')}

      {ids.includes('retail-history') && <TradeCenterHistoryCard timeline={info.timeline} title={retailHistoryTitle(name)} />}
      {ids.includes('retail-history') && after?.('retail-history')}

      {info.food && <TradeCenterFoodCard food={info.food} title={foodTitle(name)} />}
      {info.food && after?.('food')}
      {ids.includes('fun') && <TradeCenterFunCard fun={info.fun} title={funTitle(name)} />}
      {ids.includes('fun') && after?.('fun')}

      {leisure.length > 0 && (
        <div id="leisure" className={cardClass} style={glassCardShadow}>
          <CardTitle id="leisure" />
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {leisure.map((entry, i) => {
              const Icon = LEISURE_ICONS[entry.kind];
              return (
                <li
                  key={`${entry.name}-${i}`}
                  className="flex min-w-0 items-start gap-3 rounded-2xl border border-border bg-white/65 p-3"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                    title={LEISURE_KIND_LABELS[entry.kind]}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold leading-snug text-ink">{entry.name}</span>
                    {entry.text && (
                      <span className="mt-1 block break-words text-sm leading-relaxed text-ink-muted">{entry.text}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {leisure.length > 0 && after?.('leisure')}

      {ids.includes('getting-here') && <TradeCenterGettingHere info={info} />}
      {ids.includes('getting-here') && after?.('getting-here')}
      {ids.includes('offers-events') && <TradeCenterOffersEvents info={info} />}
      {ids.includes('offers-events') && after?.('offers-events')}
      {ids.includes('advertising') && <TradeCenterAdvertising info={info} name={contactName} />}
      {ids.includes('advertising') && after?.('advertising')}
      {ids.includes('numbers') && <TradeCenterNumbersCard numbers={info.numbers} />}
      {ids.includes('numbers') && after?.('numbers')}
      {ids.includes('quotes') && <TradeCenterQuotesCard quotes={info.quotes} />}
      {ids.includes('quotes') && after?.('quotes')}
      {/* При блоках еды и развлечений кинотеатр/фудкорт/фитнес из якорей уходят (anchorsForPage). */}
      {ids.includes('anchors') && <TradeCenterAnchorsCard anchors={anchorsForPage(info)} />}
      {ids.includes('anchors') && after?.('anchors')}
    </>
  );
}
