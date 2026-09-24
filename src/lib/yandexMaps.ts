// Общий загрузчик API Яндекс.Карт — вынесен из DistrictMap.tsx, когда
// появился второй компонент карты (DistrictQuarterMap.tsx), которому нужен
// тот же скрипт. Модульный синглтон промиса — скрипт грузится один раз на
// всё приложение, повторные вызовы (в т.ч. из разных компонентов карты)
// просто дожидаются того же промиса, не вставляют тег <script> повторно.
const YANDEX_MAPS_API_KEY = import.meta.env.VITE_YANDEX_MAPS_API_KEY ?? 'a7182a37-1597-4b71-9bc0-aaa154b92d13';

let ymapsLoadPromise: Promise<typeof window.ymaps> | null = null;

export function loadYmaps(): Promise<typeof window.ymaps> {
  // ?prerender=1 — тот же сигнал, что и у Яндекс.Метрики в index.html
  // (scripts/prerender.mjs снимает build-time снапшоты headless-браузером).
  // Обе карты в гиде района не нужны AI-краулерам/Яндексу в HTML (интерактив
  // всё равно недоступен без JS), а сам API — самый тяжёлый и нестабильный
  // ресурс страницы (689 КиБ, 2+ с CPU, см. PAGESPEED_PLAN.md) — незачем
  // грузить его на каждую из ~190 build-time страниц. Промис нарочно
  // никогда не разрешается — компонент карты остаётся в состоянии
  // "Загрузка карты…" (уже штатная разметка, ничего нового рисовать не
  // нужно) и просто не попадает в снапшот; на реальных визитах параметра
  // нет, поведение не меняется.
  if (typeof location !== 'undefined' && location.search.includes('prerender=1')) {
    return new Promise(() => {});
  }
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

// Ссылка-логотип «Яндекс» в копирайте карты — картинка без текста, и аудит
// доступности (а за ним дерево доступности в «Агентном просмотре»
// PageSpeed, 2026-09-23) помечает её как «ссылку без различимого названия».
// Разметка чужая и появляется не сразу после new ymaps.Map, поэтому ждём её
// наблюдателем — ТОЛЬКО внутри контейнера карты и только до первой
// подписи (или 10 с), чтобы не держать наблюдение за всей страницей.
export function labelYmapsCopyrightLink(container: HTMLElement): void {
  const label = () => {
    const links = container.querySelectorAll<HTMLAnchorElement>('a[class*="copyright__logo"]:not([aria-label])');
    links.forEach((a) => a.setAttribute('aria-label', 'Яндекс Карты'));
    return links.length > 0;
  };
  if (label()) return;
  const observer = new MutationObserver(() => {
    if (label()) observer.disconnect();
  });
  observer.observe(container, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10_000);
}

declare global {
  interface Window {
    ymaps: any;
  }
}
