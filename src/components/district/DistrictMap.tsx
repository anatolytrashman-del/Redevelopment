import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { DISTRICT_PLACE_CATEGORIES } from '../../data/districtPlaces';

// Интерактивная карта района с переключаемыми по категориям метками —
// владелец: "типо это аптеки, а это барбершопы, и можно что-то выключить,
// а что-то оставить". Заменяет прежний статичный iframe на Конструктор
// карт (тот был просто картинкой без интерактива, а Конструктор к тому же
// не хранит цвет по категориям при импорте — см. журнал CLAUDE.md).
// Данные — DISTRICT_PLACE_CATEGORIES (data/districtPlaces.ts), пополняется
// по мере присылки владельцем адресов по новым категориям.

const YANDEX_MAPS_API_KEY = import.meta.env.VITE_YANDEX_MAPS_API_KEY ?? 'a7182a37-1597-4b71-9bc0-aaa154b92d13';

// Дефолтный центр — Минск Мир, среднее по уже собранным точкам (аптеки);
// пересчитывать не нужно при добавлении категорий — это просто стартовая
// точка обзора карты, не влияет на состав меток.
const DEFAULT_CENTER: [number, number] = [53.8677, 27.5445];

// Загружаем API Яндекс.Карт один раз на всё приложение (модульный синглтон
// промиса) — компонент может размонтироваться/монтироваться повторно
// (например при навигации), повторная загрузка скрипта не нужна и ломает
// повторный вызов ymaps.ready.
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

export function DistrictMap() {
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
          center: DEFAULT_CENTER,
          zoom: 15,
          controls: ['zoomControl', 'fullscreenControl'],
        });
        mapRef.current = map;

        for (const category of DISTRICT_PLACE_CATEGORIES) {
          const collection = new ymaps.GeoObjectCollection();
          for (const place of category.places) {
            collection.add(
              new ymaps.Placemark(
                [place.lat, place.lon],
                { balloonContentHeader: place.name, balloonContentBody: place.address, hintContent: place.name },
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
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-control border border-border">
        {status === 'error' && (
          <div className="flex h-80 items-center justify-center text-sm text-ink-faint">
            Не удалось загрузить карту
          </div>
        )}
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface text-sm text-ink-faint">
            Загрузка карты…
          </div>
        )}
        <div ref={containerRef} className="h-80 w-full" />
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

declare global {
  interface Window {
    ymaps: any;
  }
}
