import { NO_ACTIVE_OFFERS_SHORT } from '../../data/businessCenterOffers';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { BusinessCenter } from '../../data/businessCenters';
import { shortName } from '../../lib/businessCenterDisplay';
import { loadYmaps } from '../../lib/yandexMaps';
import type { CatalogOfferIndex } from '../../lib/businessCenterCatalogFilter';

// Вид «карта» (К6 плана docs/bc-catalog-redesign-plan.md) — своя живая
// карта вместо статичного embed Яндекс.Конструктора, который стоял на
// каталоге раньше. Разница принципиальная: тот показывал ВСЕГДА все 143
// точки из загруженного владельцем CSV и никак не был связан с фильтром, а
// эта рисует ровно то, что сейчас отобрано, красит метку по классу и по
// клику показывает мини-карточку со ссылкой.
//
// Координаты — из business_centers.lat/lng (Д2): у всех 143 зданий.
// Здание без координат просто не попадает на карту, число таких написано
// под ней — молча терять объекты нельзя.
//
// API Яндекса тяжёлый (689 КиБ, 2+ с CPU, см. PAGESPEED_PLAN.md), поэтому
// он грузится только когда вид «карта» реально выбран — то есть по клику,
// а не при открытии каталога.

// Цвет метки по классу. Красный (фирменный primary) здесь не используется
// СПЕЦИАЛЬНО: на карте он читается как «внимание/проблема», а класс C —
// это не проблема (см. про совпадение primary и danger в CLAUDE.md).
const CLASS_COLORS: Record<string, string> = {
  A: '#1f6feb',
  'B+': '#2da44e',
  B: '#8250df',
  C: '#6e7781',
};
const UNKNOWN_CLASS_COLOR = '#adb5bd';

const MINSK_CENTER: [number, number] = [53.9023, 27.5619];
const DEFAULT_ZOOM = 11;

function balloonHtml(center: BusinessCenter, offers: CatalogOfferIndex): string {
  const rent = offers.rentBySlug.get(center.slug);
  const sale = offers.saleBySlug.get(center.slug);
  const lots = (rent?.n ?? 0) + (sale?.n ?? 0);
  const parts = [
    center.businessClass ? `Класс ${center.businessClass}` : null,
    center.totalArea != null ? `${center.totalArea.toLocaleString('ru-RU')} м²` : null,
    rent?.median != null ? `аренда $${rent.median}/м²` : null,
    sale?.median != null ? `продажа $${sale.median}/м²` : null,
    lots === 0 ? NO_ACTIVE_OFFERS_SHORT : null,
  ].filter(Boolean);
  // Экранирование не нужно: сюда попадают только наши собственные поля из
  // Supabase, которые мы же и заполняем в админке, — не пользовательский
  // ввод с публичной формы.
  return `
    <div style="min-width:180px">
      <div style="font-weight:700;margin-bottom:4px">${shortName(center)}</div>
      <div style="color:#57606a;font-size:12px;margin-bottom:6px">${parts.join(' · ')}</div>
      <a href="/minsk/bcminsk/${center.slug}" style="color:#d1002a;font-weight:600;font-size:12px">Открыть карточку →</a>
    </div>
  `;
}

// heightClass — высота полотна карты. По умолчанию как в каталоге, где
// карта это основной вид; на странице рейтинга владелец попросил вдвое
// ниже (2026-09-22): там карта — дополнительный блок внизу, и в полный
// рост она выталкивала остальное со экрана.
export function CatalogMap({
  centers,
  offers,
  heightClass = 'h-[60vh] min-h-[380px]',
}: {
  centers: BusinessCenter[];
  offers: CatalogOfferIndex;
  heightClass?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const collectionRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const withCoords = centers.filter((c) => c.lat != null && c.lng != null);
  const withoutCoords = centers.length - withCoords.length;
  // Легенда — только по классам, которые реально есть в текущей выборке.
  // Раньше рисовала все четыре класса + «не указан» всегда, даже когда на
  // карте одна «Рейтинг» с одним классом A (владелец, 2026-09-22: «нафига в
  // карте легенда на классы Б, если у нас только класс А на странице»).
  const presentClasses = Object.keys(CLASS_COLORS).filter((cls) => centers.some((c) => c.businessClass === cls));
  const hasUnknownClass = centers.some((c) => !c.businessClass);

  useEffect(() => {
    let cancelled = false;
    loadYmaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        mapRef.current = new ymaps.Map(containerRef.current, {
          center: MINSK_CENTER,
          zoom: DEFAULT_ZOOM,
          controls: ['zoomControl', 'fullscreenControl'],
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      mapRef.current?.destroy?.();
      mapRef.current = null;
      collectionRef.current = null;
    };
  }, []);

  // Метки пересобираются на каждую смену выборки — карта обязана
  // показывать ровно то, что отобрано фильтром, иначе она врёт.
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.ymaps) return;
    const ymaps = window.ymaps;
    if (collectionRef.current) mapRef.current.geoObjects.remove(collectionRef.current);
    const collection = new ymaps.GeoObjectCollection();
    for (const c of withCoords) {
      collection.add(
        new ymaps.Placemark(
          [c.lat as number, c.lng as number],
          { balloonContent: balloonHtml(c, offers), hintContent: shortName(c) },
          {
            preset: 'islands#dotIcon',
            iconColor: c.businessClass ? (CLASS_COLORS[c.businessClass] ?? UNKNOWN_CLASS_COLOR) : UNKNOWN_CLASS_COLOR,
          },
        ),
      );
    }
    mapRef.current.geoObjects.add(collection);
    collectionRef.current = collection;
    // Подгоняем вид под выборку, но не ближе разумного: на одном здании
    // bounds дали бы зум «в подъезд».
    if (withCoords.length > 1) {
      mapRef.current.setBounds(collection.getBounds(), { checkZoomRange: true, zoomMargin: 40 });
      if (mapRef.current.getZoom() > 16) mapRef.current.setZoom(16);
    } else if (withCoords.length === 1) {
      mapRef.current.setCenter([withCoords[0].lat as number, withCoords[0].lng as number], 15);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, centers, offers]);

  return (
    <div className={cn('flex flex-col gap-3 p-3 sm:p-4', glassCardClass)} style={glassCardShadow}>
      <div className={cn('relative w-full overflow-hidden rounded-2xl bg-surface-muted', heightClass)}>
        <div ref={containerRef} className="h-full w-full" />
        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
            {status === 'error' ? 'Не удалось загрузить карту' : 'Загрузка карты…'}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
        {presentClasses.map((cls) => (
          <span key={cls} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLORS[cls] }} />
            Класс {cls}
          </span>
        ))}
        {hasUnknownClass && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: UNKNOWN_CLASS_COLOR }} />
            класс не указан
          </span>
        )}
        <span className="text-ink-faint">
          На карте {withCoords.length}
          {withoutCoords > 0 && ` · без координат ${withoutCoords}`}
        </span>
      </div>
    </div>
  );
}
