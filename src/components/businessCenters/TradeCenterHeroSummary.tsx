// Правый блок первого экрана карточки ТЦ: «Сейчас», must-have саммари,
// «Как добраться», плитки с иконками. Статус «открыто» — только здесь
// (не на фото): дубли на первом экране запрещены (владелец, 2026-10-11).
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Anchor,
  Car,
  Clock,
  FerrisWheel,
  MapPin,
  Maximize2,
  Star,
  Store,
  TrainFront,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import type { BusinessCenter, NearestMetroStation } from '../../data/businessCenters';
import { cn } from '../../lib/cn';
import { METRO_LINE_DOT_CLASS, metroLineId } from '../../lib/businessCenterCatalogFilter';
import {
  hoursLiveStatus,
  laterClosingZones,
  minskNowMinutes,
  parseDailyHours,
  pickMainHoursZone,
  selectTcFactTiles,
  tcAudienceVisitorsPerDay,
  tcHeroSubtitle,
  tcMustHaveItems,
  tcParkingShort,
  tcParkingSpaces,
  type TcMustHaveKind,
} from '../../lib/tradeCenterHero';
import { FactTile } from './BusinessCenterVisuals';
import { fitGridClass } from '../../lib/fitGrid';
import { tcChipSoftClass } from './tradeCenterRetailStyle';

const MUST_HAVE_ICONS: Record<TcMustHaveKind, LucideIcon> = {
  parking: Car,
  metro: TrainFront,
  anchor: Anchor,
  fun: FerrisWheel,
  food: UtensilsCrossed,
  hours: Clock,
};

const FACT_ICONS: Record<string, LucideIcon> = {
  tenants: Store,
  area: Maximize2,
  audience: Store,
  parking: Car,
  rating: Star,
};

/**
 * Точка линии + название/расстояние станции — тот же вид, что и в блоке
 * «Расположение» у БЦ.
 */
export function MetroValue({
  nearestMetro,
  displayMetro,
  fallbackMetro,
}: {
  nearestMetro: NearestMetroStation | null;
  displayMetro: NearestMetroStation | null;
  fallbackMetro: string | null;
}): ReactNode {
  if (nearestMetro) {
    const lineId = metroLineId(nearestMetro.line);
    return (
      <>
        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', lineId ? METRO_LINE_DOT_CLASS[lineId] : 'bg-ink-faint')} />
        {nearestMetro.name} — {(displayMetro ?? nearestMetro).distanceMeters} м
      </>
    );
  }
  if (!fallbackMetro) return null;
  return (
    <>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ink-faint" />
      {fallbackMetro}
    </>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 items-baseline gap-x-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 flex min-w-0 items-start gap-1.5 text-sm leading-snug text-ink sm:mt-0">{children}</p>
    </div>
  );
}

/** Подпись под заголовком — формат/этажность/год. */
export function TradeCenterHeroSubtitle({ center }: { center: BusinessCenter }) {
  return (
    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#c45c3a]/80">
      {tcHeroSubtitle({
        retailFormat: center.retailFormat,
        floors: center.floors,
        yearBuilt: center.yearBuilt,
        status: center.status,
      })}
    </p>
  );
}

function useLiveHours(mainValue: string | null | undefined) {
  const mainParsed = mainValue ? parseDailyHours(mainValue) : null;
  const [liveStatus, setLiveStatus] = useState<{ open: boolean; label: string } | null>(null);
  useEffect(() => {
    if (!mainParsed) return;
    setLiveStatus(hoursLiveStatus(mainParsed, minskNowMinutes()));
    const id = window.setInterval(() => setLiveStatus(hoursLiveStatus(mainParsed, minskNowMinutes())), 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainValue]);
  return { liveStatus };
}

export function TradeCenterHeroSummary({
  center,
  displayAddress,
  nearestMetro,
  displayMetro,
  mapRating,
  tenantCount,
}: {
  center: BusinessCenter;
  displayAddress: string;
  nearestMetro: NearestMetroStation | null;
  displayMetro: NearestMetroStation | null;
  mapRating: { label: string } | null;
  tenantCount: number;
}) {
  const info = center.retailInfo;
  const hours = info?.hours ?? [];
  const mainHours = pickMainHoursZone(hours);
  const { liveStatus } = useLiveHours(mainHours?.value);
  const laterZones = laterClosingZones(hours, mainHours);

  const parking = info?.parking ?? null;
  // Must-have: только «N мест» — без въезда, иначе плитка длиннее «6 якорей».
  const parkingSpaces = tcParkingSpaces(parking);
  const parkingMustHave = parkingSpaces ? `${parkingSpaces}\u00a0мест` : null;
  const parkingShort = parkingMustHave ?? tcParkingShort(parking);
  const metroLabel = nearestMetro
    ? `«${nearestMetro.name}» · ${(displayMetro ?? nearestMetro).distanceMeters}\u00a0м`
    : center.metro;
  const mustHave = tcMustHaveItems(info, { parkingShort: parkingMustHave, metroLabel });

  const tiles = selectTcFactTiles({
    tenantCount,
    totalArea: center.totalArea,
    audienceValue: info ? tcAudienceVisitorsPerDay(info.audience) : null,
    parkingSpaces: parkingMustHave ? null : parkingSpaces,
    mapRatingLabel: mapRating?.label ?? null,
  });

  return (
    <>
      {mainHours && (
        <section
          className="rounded-2xl border border-[#efdfd4] bg-[#fff1e8] px-3.5 py-3.5"
          aria-labelledby="hours-summary-title"
        >
          <h2
            id="hours-summary-title"
            className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#c45c3a]/80"
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Сейчас
          </h2>
          <p className="mt-1.5 flex items-center gap-2 text-base font-extrabold leading-snug text-ink">
            {liveStatus ? (
              <>
                <span
                  className={cn(
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    liveStatus.open ? 'bg-emerald-500' : 'bg-ink-faint',
                  )}
                />
                {liveStatus.label}
              </>
            ) : (
              mainHours.value
            )}
          </p>
          {laterZones.length > 0 && (
            <p className="mt-1 text-xs leading-snug text-ink/55">{laterZones.map((z) => z.label).join(' · ')}</p>
          )}
        </section>
      )}

      {mustHave.length > 0 && (
        <section aria-labelledby="tc-musthave-title">
          <h2
            id="tc-musthave-title"
            className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#c45c3a]/80"
          >
            Коротко о ТЦ
          </h2>
          {/* Одна высота плиток: короткий ответ + line-clamp, иначе длинные
              якоря раздувают ячейку рядом с «Парковкой» (2026-10-11). */}
          <ul className={`mt-2 grid auto-rows-fr gap-2 ${fitGridClass(mustHave.length, 2, 'tiles')}`}>
            {mustHave.map((item) => {
              const Icon = MUST_HAVE_ICONS[item.kind];
              const body = (
                <>
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', tcChipSoftClass)}>
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-bold leading-snug text-ink">
                      {item.value}
                    </span>
                  </span>
                </>
              );
              const tileClass =
                'flex h-full min-h-[3.25rem] items-center gap-2.5 rounded-2xl border border-[#efdfd4] bg-white/90 px-3 py-2';
              return (
                <li key={`${item.kind}-${item.label}`} className="min-h-0">
                  {item.href ? (
                    <a href={item.href} className={cn(tileClass, 'transition-colors hover:bg-[#fff8f2]')}>
                      {body}
                    </a>
                  ) : (
                    <div className={tileClass}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section
        className="rounded-2xl border border-[#efdfd4] bg-[#fff8f2]/80 px-3.5 py-3"
        aria-labelledby="tc-directions-title"
      >
        <h2
          id="tc-directions-title"
          className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#c45c3a]/80"
        >
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          Как добраться
        </h2>
        <div className="mt-2.5 space-y-2">
          <InfoRow label="Адрес">{displayAddress}</InfoRow>
          {/* Метро/парковка — только если их ещё нет в must-have (дубли на
              первом экране запрещены, 2026-10-11). */}
          {!mustHave.some((item) => item.kind === 'metro') && (nearestMetro || center.metro) && (
            <InfoRow label="Метро">
              <MetroValue nearestMetro={nearestMetro} displayMetro={displayMetro} fallbackMetro={center.metro} />
            </InfoRow>
          )}
          {!mustHave.some((item) => item.kind === 'parking') && parkingShort && (
            <InfoRow label="Парковка">
              <Car className="h-3.5 w-3.5 shrink-0 text-[#c45c3a]/70" />
              {parkingShort}
            </InfoRow>
          )}
        </div>
      </section>

      {tiles.length > 0 && (
        <div className={`grid gap-3 ${fitGridClass(tiles.length, 3, 'tiles')}`}>
          {tiles.map((tile) => {
            const Icon = FACT_ICONS[tile.kind];
            return (
              <FactTile
                key={tile.kind}
                tone="muted"
                icon={Icon}
                label={tile.label}
                value={
                  tile.kind === 'rating' ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" />
                      {tile.value}
                    </span>
                  ) : (
                    <span className="text-[#c45c3a]">{tile.value}</span>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </>
  );
}
