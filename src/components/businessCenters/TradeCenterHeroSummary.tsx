// Правый блок первого экрана карточки ТЦ (владелец, 2026-09-25): режим
// работы с онлайн-статусом, «Как добраться» (адрес/метро/парковка вместо
// «Расположения» БЦ — без строки «Район», её у ТЦ не собирают), до трёх
// плиток фактов, якорные арендаторы чипами и быстрые переходы к разделам
// ниже по странице. У БЦ этот блок не используется — там всё как было
// (см. BusinessCenterDetailPage.tsx, секция под `isTc`).
//
// Чистая логика (разбор режима работы, выбор плиток, чипов) — в
// lib/tradeCenterHero.ts, у неё свой юнит-тест: компонент здесь только
// раскладывает готовые данные по вёрстке.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Car, Clock, Star } from 'lucide-react';
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
  tcAnchorChipNames,
  tcAudienceVisitorsPerDay,
  tcHeroSubtitle,
  tcParkingShort,
  tcParkingSpaces,
  tcQuickJumpChips,
} from '../../lib/tradeCenterHero';
import { FactTile } from './BusinessCenterVisuals';

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

function Chip({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-full border border-border bg-white/70 px-3 py-1.5 text-sm text-ink transition-colors hover:border-primary/40 hover:text-primary"
    >
      {children}
    </a>
  );
}

/** Подпись под заголовком — формат/этажность/год, одной приглушённой строкой. */
export function TradeCenterHeroSubtitle({ center }: { center: BusinessCenter }) {
  return (
    <p className="text-sm text-ink-muted">
      {tcHeroSubtitle({
        retailFormat: center.retailFormat,
        floors: center.floors,
        yearBuilt: center.yearBuilt,
        status: center.status,
      })}
    </p>
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
  const mainParsed = mainHours ? parseDailyHours(mainHours.value) : null;
  const laterZones = laterClosingZones(hours, mainHours);

  // Статус «открыто/закрыто» — только после монтирования: на сервере
  // (пререндер) и при первой отрисовке в браузере отдаём сырой текст
  // времени, чтобы не разойтись с пререндеренной разметкой (гидратация).
  const [liveStatus, setLiveStatus] = useState<{ open: boolean; label: string } | null>(null);
  useEffect(() => {
    if (!mainParsed) return;
    setLiveStatus(hoursLiveStatus(mainParsed, minskNowMinutes()));
    const id = window.setInterval(() => setLiveStatus(hoursLiveStatus(mainParsed, minskNowMinutes())), 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mainParsed пересчитывается из hours, сравнивать объект бессмысленно
  }, [mainHours?.value]);

  const parking = info?.parking ?? null;
  const parkingShort = tcParkingShort(parking);

  const tiles = selectTcFactTiles({
    tenantCount: tenantCount,
    totalArea: center.totalArea,
    audienceValue: info ? tcAudienceVisitorsPerDay(info.audience) : null,
    parkingSpaces: tcParkingSpaces(parking),
    mapRatingLabel: mapRating?.label ?? null,
  });

  const anchorNames = tcAnchorChipNames(info);
  const quickJumpChips = tcQuickJumpChips(info);

  return (
    <>
      {mainHours && (
        <section className="rounded-2xl border border-border bg-surface-muted/60 px-3.5 py-3" aria-labelledby="hours-summary-title">
          <h2 id="hours-summary-title" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Режим работы
          </h2>
          {mainHours && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm leading-snug text-ink">
              {liveStatus ? (
                <>
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', liveStatus.open ? 'bg-emerald-500' : 'bg-ink-faint')} />
                  {liveStatus.label}
                </>
              ) : (
                mainHours.value
              )}
            </p>
          )}
          {laterZones.length > 0 && (
            <p className="mt-1 text-xs text-ink-muted">{laterZones.map((z) => z.label).join(' · ')}</p>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface-muted/60 px-3.5 py-3" aria-labelledby="tc-directions-title">
        <h2 id="tc-directions-title" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
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
              <Car className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              {parkingShort}
            </InfoRow>
          )}
        </div>
      </section>

      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                  tile.value
                )
              }
            />
          ))}
        </div>
      )}

      {(anchorNames.length > 0 || quickJumpChips.length > 0) && (
        <div className="flex flex-col gap-2">
          {anchorNames.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {anchorNames.map((name) => (
                <span key={name} className="rounded-full border border-border bg-white/70 px-3 py-1 text-sm text-ink">
                  {name}
                </span>
              ))}
              {tenantCount > 0 && (
                <a href="#tenants" className="text-sm font-semibold text-primary hover:underline">
                  Все {tenantCount} арендаторов →
                </a>
              )}
            </div>
          )}
          {quickJumpChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickJumpChips.map((chip) => (
                <Chip key={chip.id} href={`#${chip.id}`}>
                  {chip.label}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
