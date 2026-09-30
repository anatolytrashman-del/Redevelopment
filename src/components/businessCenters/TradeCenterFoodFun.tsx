// «Где поесть» и «Развлечения» карточки ТЦ (2026-09-24). Владелец разделил
// старый блок «Кино, еда, развлечения» (retail_info.leisure) на два:
//
// - «Где поесть» (id `food`) — retail_info.food: итог одной фразой, зоны
//   (фудкорт и т.п.) строкой, цифры сверху и ВЕСЬ список заведений по типам
//   в виде меню (вариант Б, 2026-09-30).
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
  Clapperboard,
  Clock,
  Dumbbell,
  ExternalLink,
  Gamepad2,
  HeartPulse,
  MicVocal,
  Puzzle,
  Snowflake,
  Sparkles,
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
  formatFloorLabel,
  formatFoodFloor,
  funMetaParts,
  groupFoodPlaces,
  sortFun,
} from '../../lib/tradeCenterRetail';
import { fitGridClass } from '../../lib/fitGrid';
import { foodMenuStats, foodMenuVisibleCounts, placeHoursShort } from '../../lib/tradeCenterFood';
import { Badge } from '../ui/Badge';
import { RetailCardTitle as CardTitle } from './TradeCenterRetailParts';
import { retailCardClass as cardClass } from './tradeCenterRetailStyle';


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


// Цвет точки у типа заведения — различить группы в меню с одного взгляда.
const PLACE_DOT: Record<RetailFoodPlaceType, string> = {
  restaurant: 'bg-[#e4152b]',
  fastfood: 'bg-[#e8912d]',
  cafe: 'bg-[#3f8a57]',
  coffee: 'bg-[#7a5230]',
  dessert: 'bg-[#c9679f]',
  bar: 'bg-[#5a5fd0]',
};

function FoodZoneLine({ zone }: { zone: RetailFoodZone }) {
  const meta = [zone.floor ? formatFloorLabel(zone.floor) : null, zone.hours].filter(Boolean);
  return (
    <li className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="font-bold text-ink">{zone.name}</span>
      {meta.length > 0 && <span className="text-ink-muted">{meta.join(' · ')}</span>}
    </li>
  );
}

function FoodMenuRow({ place, hidden }: { place: RetailFoodPlace; hidden: boolean }) {
  const hours = placeHoursShort(place.note);
  const meta = [place.floor ? formatFoodFloor(place.floor) : null, hours].filter(Boolean).join(' · ');
  const nameClass = 'min-w-0 break-words text-[15px] font-semibold leading-snug text-ink';
  return (
    <li className={cn('flex min-w-0 items-baseline gap-2 py-1', hidden && 'hidden')} title={place.cuisine ?? undefined}>
      {place.yandexUrl ? (
        <a href={place.yandexUrl} target="_blank" rel="nofollow noopener noreferrer" className={cn(nameClass, 'hover:text-primary-hover')}>
          {place.name}
        </a>
      ) : (
        <span className={nameClass}>{place.name}</span>
      )}
      {place.inFoodcourt && <span className="sr-only">, фудкорт</span>}
      <span className="min-w-3 flex-1 translate-y-[-4px] border-b-[1.5px] border-dotted border-ink-faint/60" aria-hidden="true" />
      {meta && <span className="shrink-0 whitespace-nowrap text-[13px] text-ink-muted tabular-nums">{meta}</span>}
    </li>
  );
}

export function TradeCenterFoodCard({ food, title }: { food: RetailFoodInfo; title: string }) {
  const [expanded, setExpanded] = useState(false);
  const groups = groupFoodPlaces(food.places);
  const total = food.places.length;
  const visible = foodMenuVisibleCounts(groups);
  const collapsible = visible.reduce((sum, n) => sum + n, 0) < total;
  const stats = foodMenuStats(food);
  return (
    <div id="food" className={cardClass} style={glassCardShadow}>
      <CardTitle id="food" label={title} />
      {food.summary && <p className="break-words text-sm leading-relaxed text-ink-muted">{food.summary}</p>}
      {stats.length > 1 && (
        <dl className={cn('grid gap-2.5', fitGridClass(stats.length, 4, 'tiles'))}>
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0 rounded-[18px] border border-border bg-white px-4 py-3">
              <dd className="break-words text-2xl font-extrabold leading-tight tabular-nums text-ink">{stat.value}</dd>
              <dt className="mt-0.5 text-xs text-ink-muted">{stat.label}</dt>
            </div>
          ))}
        </dl>
      )}
      {food.zones.length > 0 && (
        <ul className="flex flex-col gap-1">
          {food.zones.map((zone, i) => (
            <FoodZoneLine key={`${zone.name}-${i}`} zone={zone} />
          ))}
        </ul>
      )}
      {groups.length > 0 && (
        // Колонки как в меню: группа не рвётся между колонками.
        <div className={cn('gap-x-11', groups.length > 1 && 'sm:columns-2', groups.length > 2 && 'lg:columns-3')}>
          {groups.map((group, gi) => (
            <section key={group.type} className="mb-5 break-inside-avoid">
              <h3 className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', PLACE_DOT[group.type])} aria-hidden="true" />
                {group.label}
                <span className="tabular-nums">· {group.places.length}</span>
              </h3>
              <ul>
                {group.places.map((place, i) => (
                  <FoodMenuRow key={`${place.name}-${i}`} place={place} hidden={collapsible && !expanded && i >= visible[gi]} />
                ))}
              </ul>
            </section>
          ))}
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
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-icon-bg text-icon"
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
    </div>
  );
}
