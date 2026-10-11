// Торговые блоки карточки ТЦ: крупные категории-спойлеры в порядке
// посетителя (схема → парковка → якоря → еда/развлечения → … → реклама).
// Данные — business_centers.retail_info. Каждая карточка — только если
// по ней есть записи. `after` — слот рекомендации после раздела.
import { useEffect, useState, type ReactNode } from 'react';
import { Baby, Clapperboard, Dumbbell, Sparkles, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { RetailInfo, RetailLeisureKind } from '../../data/businessCenters';
import type { TenantOrganizationView } from '../../data/businessCenterTenants';
import {
  LEISURE_KIND_LABELS,
  anchorsForPage,
  essenceText,
  foodTitle,
  funTitle,
  leisureForPage,
  retailHistoryTitle,
  retailSectionIds,
  sortLeisure,
  type RetailSectionId,
} from '../../lib/tradeCenterRetail';
import { cn } from '../../lib/cn';
import { RetailCategorySpoiler } from './RetailCategorySpoiler';
import { TradeCenterGuide } from './TradeCenterGuide';
import { loadBcExtra, peekBcExtra, type BcExtraFile } from '../../lib/buildData';
import { TradeCenterQuotesCard } from './TradeCenterExtraBlocks';
import { TradeCenterNumbersCard } from './TradeCenterNumbers';
import { TradeCenterAnchorsCard, TradeCenterHistoryCard } from './TradeCenterAnchorsHistory';
import { TradeCenterGettingHere, TradeCenterOffersEvents } from './TradeCenterVisit';
import { TradeCenterAdvertising } from './TradeCenterBusiness';
import { TradeCenterFoodCard, TradeCenterFunCard } from './TradeCenterFoodFun';
import { fitGridClass } from '../../lib/fitGrid';
import { pluralRu } from '../../lib/pluralRu';
import { tcChipSoftClass } from './tradeCenterRetailStyle';

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
  if (!info) {
    return <TradeCenterGuide key={slug} info={null} organizations={organizations} name={name} uniqueBrands={uniqueBrands} index={1} />;
  }
  const ids = retailSectionIds(info, organizations.length > 0);
  const n = (id: RetailSectionId) => {
    const pos = ids.indexOf(id);
    return pos >= 0 ? pos + 1 : undefined;
  };

  // Старый досуг — только у ТЦ без «Где поесть»/«Развлечений».
  const leisure = sortLeisure(leisureForPage(info));

  return (
    <>
      {ids.includes('floors') && <TradeCenterGuide key={slug} info={info} organizations={organizations} name={name} uniqueBrands={uniqueBrands} index={n('floors')} />}
      {ids.includes('floors') && after?.('floors')}

      {ids.includes('getting-here') && <TradeCenterGettingHere info={info} index={n('getting-here')} />}
      {ids.includes('getting-here') && after?.('getting-here')}

      {ids.includes('anchors') && <TradeCenterAnchorsCard anchors={anchorsForPage(info)} index={n('anchors')} />}
      {ids.includes('anchors') && after?.('anchors')}

      {info.food && <TradeCenterFoodCard food={info.food} title={foodTitle(name)} index={n('food')} />}
      {info.food && after?.('food')}
      {ids.includes('fun') && <TradeCenterFunCard fun={info.fun} title={funTitle(name)} index={n('fun')} />}
      {ids.includes('fun') && after?.('fun')}

      {leisure.length > 0 && (
        <RetailCategorySpoiler
          id="leisure"
          subtitle="Кино, фудкорт и активности в одном списке"
          meta={`${leisure.length} ${pluralRu(leisure.length, 'площадка', 'площадки', 'площадок')}`}
          index={n('leisure')}
        >
          <ul className={`grid gap-2 ${fitGridClass(leisure.length, 2)}`}>
            {leisure.map((entry, i) => {
              const Icon = LEISURE_ICONS[entry.kind];
              const blurb = essenceText(entry.text, 72);
              return (
                <li
                  key={`${entry.name}-${i}`}
                  className="flex min-w-0 items-start gap-3 rounded-2xl border border-[#efdfd4] bg-white/80 p-3"
                >
                  <span
                    className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tcChipSoftClass)}
                    title={LEISURE_KIND_LABELS[entry.kind]}
                  >
                    <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold leading-snug text-ink">{entry.name}</span>
                    {blurb && (
                      <span className="mt-1 block break-words text-sm leading-snug text-ink/60">{blurb}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </RetailCategorySpoiler>
      )}
      {leisure.length > 0 && after?.('leisure')}

      {ids.includes('offers-events') && <TradeCenterOffersEvents info={info} index={n('offers-events')} />}
      {ids.includes('offers-events') && after?.('offers-events')}
      {ids.includes('numbers') && <TradeCenterNumbersCard numbers={info.numbers} index={n('numbers')} />}
      {ids.includes('numbers') && after?.('numbers')}
      {ids.includes('retail-history') && <TradeCenterHistoryCard timeline={info.timeline} title={retailHistoryTitle(name)} index={n('retail-history')} />}
      {ids.includes('retail-history') && after?.('retail-history')}
      {ids.includes('quotes') && <TradeCenterQuotesCard quotes={info.quotes} index={n('quotes')} />}
      {ids.includes('quotes') && after?.('quotes')}
      {ids.includes('advertising') && <TradeCenterAdvertising info={info} name={contactName} index={n('advertising')} />}
      {ids.includes('advertising') && after?.('advertising')}
    </>
  );
}
