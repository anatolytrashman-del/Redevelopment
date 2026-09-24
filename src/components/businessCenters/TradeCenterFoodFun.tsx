// «Где поесть» и «Развлечения» карточки ТЦ (2026-09-24). Владелец разделил
// старый блок «Кино, еда, развлечения» (retail_info.leisure) на два:
//
// - «Где поесть» (id `food`) — retail_info.food: итог одной фразой, зоны
//   (фудкорт и т.п.) плашками с метриками и ВЕСЬ список заведений по типам.
//   Список бывает на 30–90 названий, поэтому свёрнут: в свёрнутом виде
//   каждая группа показывает хотя бы пару строк (foodPlacesVisibleCounts),
//   скрытые строки остаются в разметке — пререндер и поисковики видят
//   список целиком, как у ленты истории ритейла.
// - «Развлечения» (id `fun`) — retail_info.fun: плитка на площадку,
//   кинотеатр первым и во всю ширину.
//
// Порядок, заголовки, модель высоты, FAQ — lib/tradeCenterRetail.ts.
import { useState } from 'react';
import {
  Baby,
  CakeSlice,
  Clapperboard,
  Clock,
  Coffee,
  Dumbbell,
  ExternalLink,
  Gamepad2,
  HeartPulse,
  MicVocal,
  Puzzle,
  Sandwich,
  Snowflake,
  Soup,
  Sparkles,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import type {
  RetailFoodInfo,
  RetailFoodPlace,
  RetailFoodPlaceType,
  RetailFoodZone,
  RetailFunEntry,
  RetailFunKind,
} from '../../data/businessCenters';
import { pluralRu } from '../../lib/pluralRu';
import {
  FUN_KIND_LABELS,
  foodPlacesCollapsible,
  foodPlacesVisibleCounts,
  foodZoneMetrics,
  formatFloorLabel,
  formatFoodFloor,
  funMetaParts,
  groupFoodPlaces,
  sortFun,
} from '../../lib/tradeCenterRetail';
import { Badge } from '../ui/Badge';
import { RetailCardTitle as CardTitle, SourcesLine } from './TradeCenterRetailParts';
import { retailCardClass as cardClass } from './tradeCenterRetailStyle';

const PLACE_ICONS: Record<RetailFoodPlaceType, LucideIcon> = {
  restaurant: UtensilsCrossed,
  cafe: Soup,
  fastfood: Sandwich,
  coffee: Coffee,
  dessert: CakeSlice,
  bar: Wine,
};

const FUN_ICONS: Record<RetailFunKind, LucideIcon> = {
  cinema: Clapperboard,
  ice: Snowflake,
  kids: Baby,
  concert: MicVocal,
  games: Gamepad2,
  quest: Puzzle,
  sport: Dumbbell,
  fitness: HeartPulse,
  other: Sparkles,
};

const externalLinkClass =
  'underline decoration-ink-faint/40 underline-offset-2 hover:text-primary-hover hover:decoration-primary-hover/60';

function FoodZoneTile({ zone }: { zone: RetailFoodZone }) {
  const metrics = foodZoneMetrics(zone);
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-white/65 p-4">
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <UtensilsCrossed className="h-5 w-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="break-words text-base font-bold leading-snug text-ink">{zone.name}</span>
          {(zone.floor || zone.hours) && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
              {zone.floor && <span>{formatFloorLabel(zone.floor)}</span>}
              {zone.hours && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {zone.hours}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
      {metrics.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="flex min-w-0 flex-col rounded-xl bg-surface-muted/70 px-2.5 py-2 sm:px-3">
              <span className="break-words text-sm font-extrabold leading-tight tabular-nums text-ink sm:text-base">
                {m.value}
              </span>
              <span className="text-[11px] leading-snug text-ink-muted sm:text-xs">{m.label}</span>
            </div>
          ))}
        </div>
      )}
      {zone.text && <p className="break-words text-sm leading-relaxed text-ink-muted">{zone.text}</p>}
    </li>
  );
}

function FoodPlaceRow({ place, hidden }: { place: RetailFoodPlace; hidden: boolean }) {
  const meta = [place.cuisine, place.floor ? formatFoodFloor(place.floor) : null, place.note].filter(Boolean);
  return (
    <li className={cn('flex min-w-0 flex-col gap-0.5', hidden && 'hidden')}>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {place.yandexUrl ? (
          <a
            href={place.yandexUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className={cn('break-words text-sm font-semibold leading-snug text-ink', externalLinkClass)}
          >
            {place.name}
          </a>
        ) : (
          <span className="break-words text-sm font-semibold leading-snug text-ink">{place.name}</span>
        )}
        {place.inFoodcourt && (
          <span className="rounded-full bg-surface-muted px-2 py-px text-[11px] font-semibold leading-4 text-ink-muted">
            фудкорт
          </span>
        )}
      </span>
      {meta.length > 0 && <span className="break-words text-xs leading-snug text-ink-muted">{meta.join(' · ')}</span>}
    </li>
  );
}

export function TradeCenterFoodCard({ food, title }: { food: RetailFoodInfo; title: string }) {
  const [expanded, setExpanded] = useState(false);
  const groups = groupFoodPlaces(food.places);
  const total = food.places.length;
  const collapsible = foodPlacesCollapsible(groups);
  const visible = foodPlacesVisibleCounts(groups);
  return (
    <div id="food" className={cardClass} style={glassCardShadow}>
      <CardTitle id="food" label={title} />
      {food.summary && <p className="break-words text-sm leading-relaxed text-ink-muted">{food.summary}</p>}
      {food.zones.length > 0 && (
        <ul className={cn('grid grid-cols-1 gap-3', food.zones.length > 1 && 'md:grid-cols-2')}>
          {food.zones.map((zone, i) => (
            <FoodZoneTile key={`${zone.name}-${i}`} zone={zone} />
          ))}
        </ul>
      )}
      {groups.length > 0 && (
        <div className="flex flex-col gap-5">
          {groups.map((group, gi) => {
            const Icon = PLACE_ICONS[group.type];
            return (
              <section key={group.type} className="flex flex-col gap-2.5">
                <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {group.label}
                  <span className="rounded-full bg-surface-muted px-2 py-px text-xs font-semibold tabular-nums text-ink-muted">
                    {group.places.length}
                  </span>
                </h3>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {group.places.map((place, i) => (
                    <FoodPlaceRow
                      key={`${place.name}-${i}`}
                      place={place}
                      hidden={collapsible && !expanded && i >= visible[gi]}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="w-fit text-sm font-semibold text-primary-hover hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? 'Свернуть' : `Показать все ${total} ${pluralRu(total, 'заведение', 'заведения', 'заведений')}`}
        </button>
      )}
      <SourcesLine entries={food.zones} />
    </div>
  );
}

function FunTile({ entry, wide }: { entry: RetailFunEntry; wide: boolean }) {
  const Icon = FUN_ICONS[entry.kind];
  const meta = funMetaParts(entry);
  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border bg-white/65 p-4',
        wide && 'md:col-span-2',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs font-semibold text-ink-muted">{FUN_KIND_LABELS[entry.kind]}</span>
          <span className="break-words text-base font-bold leading-snug text-ink">{entry.name}</span>
          {meta.length > 0 && <span className="break-words text-xs text-ink-muted">{meta.join(' · ')}</span>}
        </div>
      </div>
      {entry.formats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.formats.map((format) => (
            <Badge key={format} tone="neutral" className="px-2.5 py-0.5">
              {format}
            </Badge>
          ))}
        </div>
      )}
      {entry.hours && (
        <p className="flex items-start gap-1.5 text-xs text-ink-muted">
          <Clock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="break-words">{entry.hours}</span>
        </p>
      )}
      {entry.text && <p className="break-words text-sm leading-relaxed text-ink-muted">{entry.text}</p>}
      {entry.yandexUrl && (
        <a
          href={entry.yandexUrl}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="mt-auto inline-flex w-fit items-center gap-1 text-xs font-semibold text-primary-hover hover:underline"
        >
          На Яндекс Картах
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
    </li>
  );
}

export function TradeCenterFunCard({ fun, title }: { fun: RetailFunEntry[]; title: string }) {
  if (!fun.length) return null;
  const sorted = sortFun(fun);
  // Кинотеатр — во всю ширину; остальные по две. Непарная последняя плитка
  // тоже растягивается, чтобы справа не зияла пустая клетка.
  const rest = sorted.filter((f) => f.kind !== 'cinema');
  const lastRest = rest.length % 2 === 1 ? rest[rest.length - 1] : null;
  return (
    <div id="fun" className={cardClass} style={glassCardShadow}>
      <CardTitle id="fun" label={title} />
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sorted.map((entry, i) => (
          <FunTile key={`${entry.name}-${i}`} entry={entry} wide={entry.kind === 'cinema' || entry === lastRest} />
        ))}
      </ul>
      <SourcesLine entries={sorted} />
    </div>
  );
}
