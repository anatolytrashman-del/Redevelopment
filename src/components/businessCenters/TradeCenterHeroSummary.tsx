// Правый блок первого экрана карточки ТЦ (владелец, 2026-09-25 → усиление
// 2026-10-11): режим работы answer-first, «что внутри» inventory-строками
// (не чипами — их сняли 2026-09-25), «Как добраться», плитки фактов.
// Оверлей на фото — TradeCenterHeroPhotoOverlays. У БЦ блок не используется.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Anchor, Car, ChevronRight, Clock, FerrisWheel, MapPin, Star, UtensilsCrossed, type LucideIcon } from 'lucide-react';
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
  tcHeroInsideLines,
  tcHeroPhotoLead,
  tcHeroSubtitle,
  tcParkingShort,
  tcParkingSpaces,
} from '../../lib/tradeCenterHero';
import { FactTile } from './BusinessCenterVisuals';
import { fitGridClass } from '../../lib/fitGrid';
import { tcChipSoftClass } from './tradeCenterRetailStyle';

const INSIDE_ICONS: Record<string, LucideIcon> = {
  '#anchors': Anchor,
  '#fun': FerrisWheel,
  '#food': UtensilsCrossed,
};

/**
 * Точка линии + название/расстояние станции — тот же вид, что и в блоке
 * «Расположение» у БЦ (владелец, 2026-09-20: «добавляй цветной кружочек для
 * обозначения линии метро»). Общий кусок разметки для обеих карточек, чтобы
 * не разъезжались, если цвет линии или подпись расстояния поменяются.
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

/** Строка label/value — тот же вид, что в «Расположении» у БЦ. */
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 items-baseline gap-x-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      {/* items-start, не items-center: у «Парковки» значение бывает
          двух-трёхстрочным (короткая сводка ≤60 символов, но переносится на
          узком экране) — center вертикально центрирует иконку по всей
          высоте блока и отрывает её от первой строки текста. */}
      <p className="mt-0.5 flex min-w-0 items-start gap-1.5 text-sm leading-snug text-ink sm:mt-0">{children}</p>
    </div>
  );
}

/** Подпись под заголовком — формат/этажность/год, одной приглушённой строкой. */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mainParsed объект, сравнивать бессмысленно
  }, [mainValue]);
  return { mainParsed, liveStatus };
}

/**
 * Оверлеи на фото ТЦ: статус открыто/закрыто + строка «зачем ехать».
 * Фото уже есть — делаем его носителем ценности, как open-now на casinolist.
 */
export function TradeCenterHeroPhotoOverlays({ center }: { center: BusinessCenter }) {
  const info = center.retailInfo;
  const mainHours = pickMainHoursZone(info?.hours ?? []);
  const { liveStatus } = useLiveHours(mainHours?.value);
  const lead = tcHeroPhotoLead(info);

  if (!liveStatus && !lead) return null;

  return (
    <>
      {liveStatus && center.status !== 'under_construction' && (
        <div className="absolute left-3 top-3 sm:left-4 sm:top-4">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm backdrop-blur-md',
              liveStatus.open
                ? 'bg-emerald-500/95 text-white'
                : 'bg-[#2a1810]/80 text-white',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', liveStatus.open ? 'bg-white' : 'bg-white/55')} />
            {liveStatus.label}
          </span>
        </div>
      )}
      {lead && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#2a1810]/80 via-[#2a1810]/35 to-transparent px-3 pb-3 pt-14 sm:px-4 sm:pb-4">
          <p className="text-sm font-semibold leading-snug text-white sm:text-[15px]">{lead}</p>
        </div>
      )}
    </>
  );
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
  const parkingShort = tcParkingShort(parking);
  const inside = tcHeroInsideLines(info);

  const tiles = selectTcFactTiles({
    tenantCount: tenantCount,
    totalArea: center.totalArea,
    audienceValue: info ? tcAudienceVisitorsPerDay(info.audience) : null,
    // Парковка уже в «Как добраться» — в плитках предпочитаем рейтинг.
    parkingSpaces: parkingShort ? null : tcParkingSpaces(parking),
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

      {inside.length > 0 && (
        <section aria-labelledby="tc-inside-title">
          <h2
            id="tc-inside-title"
            className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#c45c3a]/80"
          >
            Что внутри
          </h2>
          <ul className="mt-2 divide-y divide-[#efdfd4] overflow-hidden rounded-2xl border border-[#efdfd4] bg-white/80">
            {inside.map((line) => {
              const Icon = INSIDE_ICONS[line.href] ?? Anchor;
              return (
                <li key={line.href}>
                  <a
                    href={line.href}
                    className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-[#fff8f2]"
                  >
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tcChipSoftClass)}>
                      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                        {line.label}
                      </span>
                      <span className="block break-words text-sm font-semibold leading-snug text-ink">
                        {line.detail}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-[#c45c3a]/55 transition-transform group-hover:translate-x-0.5 group-hover:text-[#c45c3a]"
                      aria-hidden="true"
                    />
                  </a>
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
          {(nearestMetro || center.metro) && (
            <InfoRow label="Метро">
              <MetroValue nearestMetro={nearestMetro} displayMetro={displayMetro} fallbackMetro={center.metro} />
            </InfoRow>
          )}
          {parkingShort && (
            <InfoRow label="Парковка">
              <Car className="h-3.5 w-3.5 shrink-0 text-[#c45c3a]/70" />
              {parkingShort}
            </InfoRow>
          )}
        </div>
      </section>

      {tiles.length > 0 && (
        <div className={`grid gap-3 ${fitGridClass(tiles.length, 3, 'tiles')}`}>
          {tiles.map((tile) => (
            <FactTile
              key={tile.kind}
              tone="muted"
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
          ))}
        </div>
      )}
    </>
  );
}
