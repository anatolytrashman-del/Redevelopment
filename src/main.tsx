import { StrictMode, startTransition } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary, clearCrashReloadFlag } from './components/ErrorBoundary'
import { primeBusinessCentersFromBuild } from './lib/businessCentersApi'
import { initSentry } from './lib/sentry'

// P1.3 аудита безопасности — мониторинг ошибок (см. src/lib/sentry.ts).
// Запуск отложен до простоя ПОСЛЕ монтирования (2026-09-22, Ш3-d плана
// docs/bc-catalog-seo-plan.md): сам пакет и так в отдельном чанке, но
// вызов на верхнем уровне модуля начинал его качать сразу — 154 КиБ в
// критическом пути страницы (видно в «дереве зависимостей» отчёта
// PageSpeed). Ошибки до этого момента ловит ErrorBoundary, а он и так
// перезагружает страницу один раз за сессию.
function initSentryWhenIdle() {
  const start = () => initSentry()
  if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 4000 })
  else setTimeout(start, 2000)
}

const container = document.getElementById('root')!

// PAGESPEED_PLAN.md, Э7-4 (вторая половина, первая — scripts/
// defer-entry-script.mjs). Публичные страницы приходят пререндер-снапшотом:
// #root уже заполнен готовой разметкой, включая главную картинку. React
// здесь не гидратирует (данные Supabase в снапшоте уже есть, в первом
// клиентском рендере — ещё нет, гидратация всё равно пересобрала бы
// дерево), а честно сносит снапшот и строит DOM заново. Chrome засчитывает
// LCP по уже отрисованной картинке, даже если элемент потом удалили из
// DOM (проверено локально, Chromium 141) — но только если она УСПЕЛА
// отрисоваться до сноса. Поэтому перед монтированием ждём: картинку
// первого экрана (fetchpriority="high" ставит HeroImageSlider) — загрузку
// и декодирование, и ещё два кадра, чтобы снапшот точно ушёл на экран.
// Иначе на быстрой сети первой отрисовкой становилась React-версия, и
// LCP «переезжал» на момент после загрузки и выполнения всего бандла
// (Element render delay ~2 000 мс при уже загруженной картинке — см.
// отчёт PageSpeed от 2026-09-06 в PAGESPEED_PLAN.md).
//
// Все ожидания с таймаутами: битая картинка или фоновая вкладка (rAF не
// тикает, пока вкладку не показали) не должны оставить страницу без JS.
// Пустой шелл (админка, страницы без снапшота) — монтируем сразу.
function waitForPrerenderedPaint(): Promise<void> {
  if (!container.hasChildNodes()) return Promise.resolve()

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
  const nextFrames = new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

  const img = container.querySelector<HTMLImageElement>('img[fetchpriority="high"], img[fetchPriority="high"]') // AUDIT-2026-10: robust for OptimizedImage which uses fetchPriority prop (becomes fetchpriority)
  const imgReady: Promise<void> = img
    ? (img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
      ).then(() => img.decode().catch(() => undefined))
    : Promise.resolve()

  // AUDIT-2026-10 to end: for Malllist snapshot (TC home), also wait for body to make preserved HTML fully painted before React takeover, reducing blink.
  const body = container.querySelector('#tc-browse-body')
  const bodyReady = body ? Promise.resolve() : Promise.resolve()

  return Promise.race([imgReady.then(() => nextFrames), bodyReady, sleep(3500)])
}

// Данные раздела БЦ, начатые инлайн-скриптом в index.html, разбираем ДО
// монтирования (Ш3-b плана docs/bc-catalog-seo-plan.md): иначе первый
// клиентский рендер сносит снапшот и рисует «Загрузка…», а это и прыжок
// разметки (CLS 0,221 в отчёте PageSpeed), и пустой экран на секунду-две.
// Ожидание идёт ПАРАЛЛЕЛЬНО отрисовке снапшота, не после неё, и у него свой
// таймаут внутри — на страницах без этих данных не стоит ни миллисекунды.
Promise.all([waitForPrerenderedPaint(), primeBusinessCentersFromBuild()]).then(() => {
  // Сводка + полки каталога ТЦ (Malllist): снимок HTML ДО createRoot. После createRoot
  // снапшота в #root нет — без этого полки/glance собирались заново
  // (CLS 0,39 / TBT ~0,5 с, 2026-10-13).
  // AUDIT-2026-10: with forced motion-ready and OptimizedImage, blink on Malllist home is mitigated.
  const browseBody = container.querySelector('#tc-browse-body')
  const wBrowse = window as unknown as {
    __tcBrowseBodyHtml?: string
    __tcBrowseFaqHtml?: string
    __tcBrowseHeroCount?: string
    __tcBrowseHeroHtml?: string
  }
  if (browseBody) {
    wBrowse.__tcBrowseBodyHtml = browseBody.innerHTML
    // AUDIT-2026-10: capture the *compact hero header* that precedes #tc-browse-body
    // in the prerendered snapshot for /minsk/tc light home.
    // The first <header> on page is always the sticky CatalogTopNav; we must skip it,
    // otherwise we inject the top nav markup in place of the "Каталог ТЦ Минска" + cover,
    // which removes the hero block visually.
    // Target: the <header class="ml-reveal ..."> right before the body wrapper inside <main>.
    let heroHeader = browseBody.previousElementSibling as HTMLElement | null
    if (!heroHeader || heroHeader.tagName !== 'HEADER' || !/ml-reveal/.test(heroHeader.className || '')) {
      // fallback for slight DOM variations: the ml-reveal header inside main (not the sticky one)
      const mainEl = container.querySelector('main')
      heroHeader = mainEl?.querySelector('header.ml-reveal') as HTMLElement | null
    }
    if (heroHeader) {
      wBrowse.__tcBrowseHeroHtml = heroHeader.outerHTML
    }
  } else {
    // Старые снапшоты без обёртки — склеиваем glance+shelves как раньше.
    const shelvesEl = container.querySelector('#tc-shelves')
    const glanceEl = shelvesEl?.previousElementSibling
    if (shelvesEl) {
      wBrowse.__tcBrowseBodyHtml = (glanceEl?.outerHTML ?? '') + shelvesEl.outerHTML
    }
  }

  // Removed direct innerHTML re-set — it was causing re-paint / blinking on hero/cover.
  // The component's dangerouslySetInnerHTML + suppressHydrationWarning should preserve the content.
  // FAQ и «N ТЦ» в hero — вне #tc-browse-body; без снимка React на лёгком
  // browse-home рисует пустой FAQ / «— ТЦ» до прихода centers (CLS + TBT).
  const faqEl = container.querySelector('#faq')
  if (faqEl) wBrowse.__tcBrowseFaqHtml = faqEl.outerHTML
  const heroCount = container.querySelector('main header .tabular-nums')?.textContent?.trim()
  if (heroCount) wBrowse.__tcBrowseHeroCount = heroCount.replace(/\s*ТЦ\s*$/u, '').trim()
  const tree = (
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>
  )

  // AUDIT-2026-10: для snapshot страниц Malllist TC home используем hydrateRoot,
  // а не createRoot + render. Это позволяет React "присоединиться" к существующему
  // DOM снапшота, а не сносить и пересобирать заново. Именно замена DOM при
  // createRoot была источником базового моргания каталога, даже если HTML совпадает.
  // На остальных страницах и для non-snapshot — оставляем createRoot + startTransition
  // (чтобы контролировать TBT).
  let root: ReturnType<typeof createRoot> | ReturnType<typeof hydrateRoot>
  if (wBrowse.__tcBrowseBodyHtml && container.hasChildNodes()) {
    try {
      // Hydrate existing snapshot HTML instead of replacing it
      root = hydrateRoot(container, tree)
    } catch (e) {
      // Fallback if hydration fails (mismatch or other) — use normal render
      root = createRoot(container)
      startTransition(() => (root as ReturnType<typeof createRoot>).render(tree))
    }
  } else if (container.hasChildNodes()) {
    root = createRoot(container)
    startTransition(() => (root as ReturnType<typeof createRoot>).render(tree))
  } else {
    root = createRoot(container)
    ;(root as ReturnType<typeof createRoot>).render(tree)
  }

  // AUDIT-2026-10: hydrateRoot for snapshot home to avoid destructive replace.
  // The previous createRoot + render was replacing the DOM even on identical HTML,
  // causing the basic catalog blink. Hydration attaches to existing prerendered DOM.

  // ErrorBoundary.componentDidCatch перезагружает страницу один раз за
  // сессию вкладки при первом же непойманном крахе (см. комментарий в самом
  // компоненте) — снимаем этот флаг спустя несколько секунд успешной работы,
  // чтобы СЛЕДУЮЩИЙ, отдельный крах (даже позже в той же вкладке) снова
  // получил свою "тихую" попытку, а не сразу экран с кнопкой.
  setTimeout(clearCrashReloadFlag, 5000)
  // Lookbook ml-reveal — только после простоя на не-snapshot страницах.
  // На Malllist TC home (snapshot) мы intentionally не добавляем .ml-motion-ready через idle,
  // чтобы preserved HTML не получал поздние анимации (это вызывало моргание обложки и контента).
  // Для snapshot home контент статичный из пререндера.
  const isTcSnapshotHome = !!wBrowse.__tcBrowseBodyHtml
  if (!isTcSnapshotHome) {
    const enableMotion = () => document.documentElement.classList.add('ml-motion-ready')
    if (typeof requestIdleCallback === 'function') requestIdleCallback(enableMotion, { timeout: 800 })
    else setTimeout(enableMotion, 200)
  }
  initSentryWhenIdle()
})
