import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { BusinessCenter } from '../../data/businessCenters';
import { shortName } from '../../lib/businessCenterDisplay';
import { loadYmaps } from '../../lib/yandexMaps';
import { useInView } from '../../lib/useInView';
import type { CatalogOfferIndex } from '../../lib/businessCenterCatalogFilter';
import { nearestNeighbours } from '../../lib/businessCenterMarketPosition';

// Б3 и Б6 плана docs/bc-catalog-redesign-plan.md — карта здания с соседями и
// похожие БЦ. До 2026-09-16 на карточке бизнес-центра НЕ БЫЛО КАРТЫ ВООБЩЕ:
// страница рассказывала про здание, но не показывала, где оно и что вокруг.
//
// Соседи считаются по прямой от координат (Д2). Именно «по прямой», и так
// и подписано: маршрутов у нас нет, и превращать 400 метров по воздуху в
// «5 минут пешком» значило бы выдумать данные.

const DEFAULT_ZOOM = 15;

function MiniMap({ center, neighbours }: { center: BusinessCenter; neighbours: { center: BusinessCenter }[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  // Карта Яндекса — 689 КиБ и 2+ с CPU (PAGESPEED_PLAN.md), а блок стоит в
  // середине длинной страницы: грузим, только когда до него доскроллили.
  const [viewportRef, inView] = useInView<HTMLDivElement>();

  useEffect(() => {
    if (!inView || center.lat == null || center.lng == null) return;
    let cancelled = false;
    loadYmaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = new ymaps.Map(containerRef.current, {
          center: [center.lat as number, center.lng as number],
          zoom: DEFAULT_ZOOM,
          controls: ['zoomControl', 'fullscreenControl'],
        });
        map.geoObjects.add(
          new ymaps.Placemark(
            [center.lat as number, center.lng as number],
            { hintContent: shortName(center) },
            { preset: 'islands#dotIcon', iconColor: '#d1002a' },
          ),
        );
        for (const n of neighbours) {
          if (n.center.lat == null || n.center.lng == null) continue;
          map.geoObjects.add(
            new ymaps.Placemark(
              [n.center.lat, n.center.lng],
              {
                hintContent: shortName(n.center),
                balloonContent: `<a href="/minsk/bcminsk/${n.center.slug}" style="font-weight:600">${shortName(n.center)}</a>`,
              },
              { preset: 'islands#dotIcon', iconColor: '#6e7781' },
            ),
          );
        }
        mapRef.current = map;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, center.slug]);

  return (
    <div ref={viewportRef} className="relative h-64 w-full overflow-hidden rounded-2xl bg-surface-muted sm:h-80">
      <div ref={containerRef} className="h-full w-full" />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
          {status === 'error' ? 'Не удалось загрузить карту' : 'Загрузка карты…'}
        </div>
      )}
    </div>
  );
}

const DASH = <span className="text-ink-faint">—</span>;

export function NeighboursBlock({
  center,
  all,
  offers,
}: {
  center: BusinessCenter;
  all: BusinessCenter[];
  offers: CatalogOfferIndex;
}) {
  const neighbours = useMemo(() => nearestNeighbours(center, all, 5), [center, all]);
  if (center.lat == null || center.lng == null) return null;

  const ownRent = offers.rentBySlug.get(center.slug)?.median ?? null;

  return (
    <div id="map" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <MapPin className="h-5 w-5 shrink-0 text-ink-muted" />
          На карте и что рядом
        </h2>
        <p className="text-xs text-ink-faint">
          Пять ближайших зданий каталога — отобраны по расстоянию, независимо от класса
          и района. Расстояния по прямой, по координатам 2ГИС.
        </p>
      </div>
      <MiniMap center={center} neighbours={neighbours} />
      {neighbours.length > 0 && (
        // Таблица, а не список: смысл блока — сравнить соседей по одним и
        // тем же величинам. Неизвестное обозначено прочерком явно, нулём
        // или пустотой не подменяется.
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <th scope="col" className="py-2 pr-3 text-left">Бизнес-центр</th>
                <th scope="col" className="py-2 px-2 text-right">По прямой</th>
                <th scope="col" className="py-2 px-2 text-left">Класс</th>
                <th scope="col" className="py-2 px-2 text-right">Площадь</th>
                <th scope="col" className="py-2 pl-2 text-right">Аренда</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {neighbours.map(({ center: n, meters }) => {
                const rent = offers.rentBySlug.get(n.slug)?.median ?? null;
                // «Дешевле» пишем только когда есть обе ставки — иначе это
                // было бы сравнение с пустотой.
                const cheaper = ownRent != null && rent != null && rent < ownRent;
                return (
                  <tr key={n.slug}>
                    <td className="py-2.5 pr-3">
                      <Link to={`/minsk/bcminsk/${n.slug}`} className="font-medium text-ink hover:text-primary-hover">
                        {shortName(n)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right tabular-nums text-ink-muted">
                      {meters.toLocaleString('ru-RU')} м
                    </td>
                    <td className="py-2.5 px-2 text-ink-muted">{n.businessClass ?? DASH}</td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right tabular-nums text-ink-muted">
                      {n.totalArea != null ? `${n.totalArea.toLocaleString('ru-RU')} м²` : DASH}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pl-2 text-right tabular-nums">
                      {rent != null ? (
                        <span className={cheaper ? 'font-semibold text-[#0f6b3d]' : 'text-ink-muted'}>
                          ${rent}/м²
                        </span>
                      ) : (
                        DASH
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Б6. Похожие бизнес-центры -----------------------------------------

// «Похожий» — тот же класс и тот же район; если таких меньше трёх,
// расширяем до того же класса по городу. Сортируем по близости площади:
// здание на 40 000 м² и на 900 м² одного класса решают разные задачи.
export function similarCenters(
  center: BusinessCenter,
  all: BusinessCenter[],
  limit = 6,
  // Слаги, уже показанные в блоке «На карте и что рядом». Соседи и похожие —
  // ДВЕ РАЗНЫЕ подборки (одна про расположение, другая про замену), и одно и
  // то же здание в обеих читается как то, что список нечем наполнить.
  exclude: ReadonlySet<string> = new Set(),
): BusinessCenter[] {
  const pool = all.filter(
    (c) => c.slug !== center.slug && !exclude.has(c.slug) && c.businessClass === center.businessClass,
  );
  const sameDistrict = center.district ? pool.filter((c) => c.district === center.district) : [];
  const base = sameDistrict.length >= 3 ? sameDistrict : pool;
  if (center.totalArea == null) return base.slice(0, limit);
  return [...base]
    .sort(
      (a, b) =>
        Math.abs((a.totalArea ?? Infinity) - (center.totalArea as number)) -
        Math.abs((b.totalArea ?? Infinity) - (center.totalArea as number)),
    )
    .slice(0, limit);
}

export function SimilarCentersBlock({
  center,
  all,
  offers,
  hubChips,
}: {
  center: BusinessCenter;
  all: BusinessCenter[];
  offers: CatalogOfferIndex;
  hubChips: { label: string; url: string }[];
}) {
  const similar = useMemo(() => {
    const neighbourSlugs = new Set(nearestNeighbours(center, all, 5).map((n) => n.center.slug));
    return similarCenters(center, all, 6, neighbourSlugs);
  }, [center, all]);
  if (similar.length === 0 && hubChips.length === 0) return null;
  return (
    <div id="similar" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Building2 className="h-5 w-5 shrink-0 text-ink-muted" />
          Похожие бизнес-центры
        </h2>
        <p className="text-xs text-ink-faint">
          Тот же класс и тот же район, ближайшие по размеру здания; те, что уже перечислены
          выше как соседние, сюда не попадают.
        </p>
      </div>
      {similar.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {similar.map((c) => {
            const rent = offers.rentBySlug.get(c.slug)?.median ?? null;
            return (
              <Link
                key={c.slug}
                to={`/minsk/bcminsk/${c.slug}`}
                className="flex flex-col gap-0.5 rounded-2xl bg-surface-muted px-4 py-3 transition-colors hover:bg-border/40"
              >
                <span className="text-sm font-semibold text-ink">{shortName(c)}</span>
                <span className="text-xs text-ink-muted">
                  {[
                    c.businessClass ? `класс ${c.businessClass}` : null,
                    c.district,
                    c.totalArea != null ? `${c.totalArea.toLocaleString('ru-RU')} м²` : null,
                    rent != null ? `$${rent}/м²` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Link>
            );
          })}
        </div>
      )}
      {/* Хабы чипами вместо простого текста (пункт «ссылки на хабы» из
          BCMINSK_SEO_PLAN.md): те же ссылки, но их видно и по ним кликают. */}
      {hubChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {hubChips.map((chip) => (
            <Link
              key={chip.url}
              to={chip.url}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary-hover"
            >
              {chip.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
