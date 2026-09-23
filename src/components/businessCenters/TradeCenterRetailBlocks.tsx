// Торговые блоки карточки ТЦ (2026-09-23): «Что на каком этаже», «Первые в
// Беларуси и якоря», «Кино, еда, развлечения» и строка места в рейтинге ТЦ
// Минска; за ними — «Посетителю», «Арендаторам и рекламодателям», «ТЦ в
// цифрах» и «Цитаты» (TradeCenterExtraBlocks.tsx). Данные —
// business_centers.retail_info (у БЦ пусто, компонент не рисует ничего). Каждая карточка — только если по ней есть записи.
//
// Источники у каждой записи свои, но под каждой строкой ссылку не ставим —
// карточка превратилась бы в сноски. Внизу карточки один общий список без
// дублей, мелким серым, rel=nofollow: это цитирование, а не рекомендация.
//
// `after` — место для блока-рекомендации после карточки (как
// renderRecommendationSlot у остальных блоков страницы): раскладка
// рекомендаций видит эти карточки как отдельные разделы.
import type { ReactNode } from 'react';
import { Baby, Clapperboard, Dumbbell, Sparkles, Trophy, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import type { RetailInfo, RetailLeisureKind, RetailRankingEntry } from '../../data/businessCenters';
import {
  LEISURE_KIND_LABELS,
  floorSortKey,
  formatFloorBadge,
  formatRankingLine,
  formatRetailDate,
  retailSectionIds,
  sortFloorsTopDown,
  sortLeisure,
  type RetailSectionId,
} from '../../lib/tradeCenterRetail';
import { RetailCardTitle as CardTitle, SourcesLine } from './TradeCenterRetailParts';
import { retailCardClass as cardClass } from './tradeCenterRetailStyle';
import {
  TradeCenterBusinessCard,
  TradeCenterNumbersCard,
  TradeCenterQuotesCard,
  TradeCenterVisitCard,
} from './TradeCenterExtraBlocks';

const LEISURE_ICONS: Record<RetailLeisureKind, LucideIcon> = {
  cinema: Clapperboard,
  food: UtensilsCrossed,
  kids: Baby,
  sport: Dumbbell,
  other: Sparkles,
};

function RankingLines({ ranking }: { ranking: RetailRankingEntry[] }) {
  if (!ranking.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {ranking.map((entry, i) => (
        <li
          key={i}
          className="flex items-start gap-2 self-start rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm font-medium leading-snug text-ink"
        >
          <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span className="min-w-0 break-words">{formatRankingLine(entry)}</span>
        </li>
      ))}
    </ul>
  );
}

export function TradeCenterRetailBlocks({
  info,
  after,
}: {
  info: RetailInfo | null;
  after?: (id: RetailSectionId) => ReactNode;
}) {
  if (!info) return null;
  const ids = retailSectionIds(info);
  // Рейтинг — не отдельная карточка, а строка в первой из нарисованных
  // карточек состава здания (этажи / первые / досуг).
  const rankingHost: RetailSectionId | null =
    ids.find((id) => id === 'floors' || id === 'firsts' || id === 'leisure') ?? null;
  const rankingIn = (id: RetailSectionId) => (id === rankingHost ? info.ranking : []);

  // Карточек состава здания нет, а место в рейтинге есть — карточка из
  // одной строки, без пункта в меню.
  const rankingOnly =
    !rankingHost && info.ranking.length > 0 ? (
      <div className={cardClass} style={glassCardShadow}>
        <RankingLines ranking={info.ranking} />
        <SourcesLine entries={info.ranking} />
      </div>
    ) : null;

  const floors = sortFloorsTopDown(info.floorsGuide);
  const firsts = info.firsts.filter((f) => f.kind === 'first');
  const anchors = info.firsts.filter((f) => f.kind === 'anchor');
  const former = info.firsts.filter((f) => f.kind === 'former_anchor');
  const leisure = sortLeisure(info.leisure);

  return (
    <>
      {rankingOnly}
      {floors.length > 0 && (
        <div id="floors" className={cardClass} style={glassCardShadow}>
          <CardTitle id="floors" />
          <RankingLines ranking={rankingIn('floors')} />
          <ul className="flex flex-col divide-y divide-border">
            {floors.map((entry, i) => {
              const underground = (floorSortKey(entry.floor) ?? 0) < 0;
              return (
                <li key={`${entry.floor}-${i}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className={cn(
                      'flex h-9 min-w-[3.25rem] shrink-0 items-center justify-center rounded-xl px-2 text-sm font-bold tabular-nums',
                      underground ? 'bg-surface-muted text-ink-muted' : 'bg-primary/10 text-primary',
                    )}
                    aria-label={`Этаж ${formatFloorBadge(entry.floor)}`}
                  >
                    {formatFloorBadge(entry.floor)}
                  </span>
                  <p className="min-w-0 flex-1 break-words pt-1.5 text-sm leading-relaxed text-ink-muted">{entry.text}</p>
                </li>
              );
            })}
          </ul>
          <SourcesLine entries={[...rankingIn('floors'), ...floors]} />
        </div>
      )}
      {floors.length > 0 && after?.('floors')}

      {info.firsts.length > 0 && (
        <div id="firsts" className={cardClass} style={glassCardShadow}>
          <CardTitle id="firsts" />
          <RankingLines ranking={rankingIn('firsts')} />
          {firsts.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Впервые в Беларуси</h3>
              <ul className="flex flex-col divide-y divide-border">
                {firsts.map((entry, i) => {
                  const when = formatRetailDate(entry.date);
                  return (
                    <li key={`${entry.name}-${i}`} className="flex flex-col gap-1 py-3 first:pt-1 last:pb-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="break-words text-sm font-semibold text-ink">{entry.name}</span>
                        {when && (
                          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">{when}</span>
                        )}
                      </div>
                      {entry.text && <p className="break-words text-sm leading-relaxed text-ink-muted">{entry.text}</p>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {anchors.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Якорные арендаторы</h3>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {anchors.map((entry, i) => (
                  <li
                    key={`${entry.name}-${i}`}
                    className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-white/65 p-3"
                  >
                    <span className="break-words text-sm font-semibold text-ink">{entry.name}</span>
                    {entry.text && <span className="break-words text-sm leading-relaxed text-ink-muted">{entry.text}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {former.length > 0 && (
            <p className="break-words text-xs leading-relaxed text-ink-muted">
              Раньше здесь были: {former.map((f) => f.name).join(', ')}.
            </p>
          )}
          <SourcesLine entries={[...rankingIn('firsts'), ...firsts, ...anchors, ...former]} />
        </div>
      )}
      {info.firsts.length > 0 && after?.('firsts')}

      {leisure.length > 0 && (
        <div id="leisure" className={cardClass} style={glassCardShadow}>
          <CardTitle id="leisure" />
          <RankingLines ranking={rankingIn('leisure')} />
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
          <SourcesLine entries={[...rankingIn('leisure'), ...leisure]} />
        </div>
      )}
      {leisure.length > 0 && after?.('leisure')}

      {ids.includes('visit') && <TradeCenterVisitCard info={info} />}
      {ids.includes('visit') && after?.('visit')}
      {ids.includes('business') && <TradeCenterBusinessCard info={info} />}
      {ids.includes('business') && after?.('business')}
      {ids.includes('numbers') && <TradeCenterNumbersCard numbers={info.numbers} />}
      {ids.includes('numbers') && after?.('numbers')}
      {ids.includes('quotes') && <TradeCenterQuotesCard quotes={info.quotes} />}
      {ids.includes('quotes') && after?.('quotes')}
    </>
  );
}
