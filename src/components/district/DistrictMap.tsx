import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Maximize2, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import { DISTRICT_PLACE_CATEGORIES } from '../../data/districtPlaces';

// Интерактивная карта района с переключаемыми по категориям метками —
// владелец: "типо это аптеки, а это барбершопы, и можно что-то выключить,
// а что-то оставить". Заменяет прежний статичный iframe на Конструктор
// карт (тот был просто картинкой без интерактива, а Конструктор к тому же
// не хранит цвет по категориям при импорте — см. журнал CLAUDE.md).
// Данные — DISTRICT_PLACE_CATEGORIES (data/districtPlaces.ts), пополняется
// по мере присылки владельцем адресов по новым категориям.

const YANDEX_MAPS_API_KEY = import.meta.env.VITE_YANDEX_MAPS_API_KEY ?? 'a7182a37-1597-4b71-9bc0-aaa154b92d13';

// Границы — не center+zoom, а bounds по факту собранных точек (с небольшим
// отступом) — владелец: "на лендинге в карту не влезает весь район".
// Пересчитано по data/districtPlaces.ts после чистки от адресов за
// пределами района (2026-08-25, см. журнал CLAUDE.md — три раунда правок
// от владельца: севернее Аэродромной, кластер Брилевская/Чкалова/
// Короткевича, всё южнее Кижеватова кроме автосервисов). Категория 'auto'
// сознательно ИСКЛЮЧЕНА из расчёта границ — большая часть её точек это
// известный "рядом, но за пределами района" автосервисный кластер на
// Казинца/Брестской/Бородинской/Брилевском тупике (см. autoServiceCluster*
// в DistrictGuidePage.tsx), который остаётся на карте, но не должен
// растягивать стартовый вид. Пересчитывать при заметном расширении набора
// точек за эти границы.
const DEFAULT_BOUNDS: [[number, number], [number, number]] = [
  [53.857, 27.523],
  [53.875, 27.564],
];

// Загружаем API Яндекс.Карт один раз на всё приложение (модульный синглтон
// промиса) — компонент может размонтироваться/монтироваться повторно
// (например при навигации, или при открытии модалки на весь экран — там
// свой экземпляр карты, но скрипт API общий), повторная загрузка скрипта
// не нужна и ломает повторный вызов ymaps.ready.
let ymapsLoadPromise: Promise<typeof window.ymaps> | null = null;
function loadYmaps(): Promise<typeof window.ymaps> {
  if (ymapsLoadPromise) return ymapsLoadPromise;
  ymapsLoadPromise = new Promise((resolve, reject) => {
    if (window.ymaps) {
      window.ymaps.ready(() => resolve(window.ymaps));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_MAPS_API_KEY}&lang=ru_RU`;
    script.async = true;
    script.onload = () => window.ymaps.ready(() => resolve(window.ymaps));
    script.onerror = () => reject(new Error('Не удалось загрузить API Яндекс.Карт'));
    document.head.appendChild(script);
  });
  return ymapsLoadPromise;
}

// Карта + легенда — самостоятельный блок, использован дважды (компактно
// на странице и крупно в полноэкранной модалке). Каждый экземпляр — своя
// карта Яндекса и свой стейт переключателей (независимые, не синхронизированы
// между компактным и полноэкранным видом — то же самое, что и у Pro-режима
// "Первичного рынка": модалка открывается со своим дефолтным состоянием).
function DistrictMapCanvas({ mapHeightClassName }: { mapHeightClassName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const collectionsRef = useRef<Record<string, any>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [activeKeys, setActiveKeys] = useState<Set<string>>(
    () => new Set(DISTRICT_PLACE_CATEGORIES.map((c) => c.key)),
  );

  useEffect(() => {
    let cancelled = false;

    loadYmaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current) return;

        const map = new ymaps.Map(containerRef.current, {
          bounds: DEFAULT_BOUNDS,
          controls: ['zoomControl', 'fullscreenControl'],
        });
        mapRef.current = map;

        for (const category of DISTRICT_PLACE_CATEGORIES) {
          const collection = new ymaps.GeoObjectCollection();
          for (const place of category.places) {
            collection.add(
              new ymaps.Placemark(
                [place.lat, place.lon],
                {
                  balloonContentHeader: place.name,
                  balloonContentBody: `
                    <div style="display:inline-flex;align-items:center;gap:6px;margin-bottom:6px;padding:2px 8px;border-radius:999px;background:${category.color}1a;color:${category.color};font-size:12px;font-weight:600;">
                      <span style="width:6px;height:6px;border-radius:999px;background:${category.color};"></span>
                      ${category.label}
                    </div>
                    <div>${place.address}</div>
                  `,
                  hintContent: place.name,
                },
                { preset: 'islands#dotIcon', iconColor: category.color },
              ),
            );
          }
          map.geoObjects.add(collection);
          collectionsRef.current[category.key] = collection;
        }

        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      mapRef.current?.destroy?.();
      mapRef.current = null;
      collectionsRef.current = {};
    };
  }, []);

  function toggleCategory(key: string) {
    setActiveKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      const collection = collectionsRef.current[key];
      if (collection) collection.options.set('visible', next.has(key));
      return next;
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className={cn('relative overflow-hidden rounded-control border border-border', mapHeightClassName)}>
        {status === 'error' && (
          <div className="flex h-full items-center justify-center text-sm text-ink-faint">
            Не удалось загрузить карту
          </div>
        )}
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface text-sm text-ink-faint">
            Загрузка карты…
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DISTRICT_PLACE_CATEGORIES.map((category) => {
          const active = activeKeys.has(category.key);
          return (
            <button
              key={category.key}
              type="button"
              onClick={() => toggleCategory(category.key)}
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-border bg-surface-muted text-ink hover:bg-border'
                  : 'border-border/60 text-ink-faint hover:border-border hover:text-ink-muted'
              }`}
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors"
                style={
                  active
                    ? { backgroundColor: category.color, borderColor: category.color }
                    : { borderColor: '#d8d6d2' }
                }
              >
                {active && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </span>
              <span className={active ? '' : 'line-through decoration-ink-faint'}>{category.label}</span>
              <span className="text-ink-faint">{category.places.length}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-faint">Нажмите на категорию, чтобы показать или скрыть её метки на карте.</p>
    </div>
  );
}

export function DistrictMap() {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  return (
    <div className="flex flex-col gap-3">
      <DistrictMapCanvas mapHeightClassName="h-80" />
      <button
        type="button"
        onClick={() => setFullscreen(true)}
        className="flex items-center gap-3 rounded-control bg-surface-muted px-5 py-4 text-left transition-colors hover:bg-border"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white">
          <Maximize2 className="h-4 w-4" />
        </span>
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-sm font-bold text-ink">Открыть на весь экран</span>
          <span className="text-xs text-ink-faint">Крупная карта района со всеми метками и фильтром по категориям</span>
        </span>
      </button>

      {fullscreen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setFullscreen(false)} />
            <div
              className="relative flex h-full w-full max-w-5xl flex-col gap-3 overflow-hidden rounded-3xl border border-white/80 bg-bg p-4 sm:p-6"
              style={glassCardShadow}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-ink">Карта района</h2>
                <button
                  type="button"
                  onClick={() => setFullscreen(false)}
                  className="flex shrink-0 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90"
                >
                  <X className="h-4 w-4" />
                  Закрыть
                </button>
              </div>
              <DistrictMapCanvas mapHeightClassName="flex-1" />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

declare global {
  interface Window {
    ymaps: any;
  }
}
