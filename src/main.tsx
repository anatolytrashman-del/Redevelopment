import { StrictMode, startTransition } from 'react'
import { createRoot } from 'react-dom/client'
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

  const img = container.querySelector<HTMLImageElement>('img[fetchpriority="high"]')
  const imgReady: Promise<void> = img
    ? (img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
      ).then(() => img.decode().catch(() => undefined))
    : Promise.resolve()

  return Promise.race([imgReady.then(() => nextFrames), sleep(3500)])
}

// Данные раздела БЦ, начатые инлайн-скриптом в index.html, разбираем ДО
// монтирования (Ш3-b плана docs/bc-catalog-seo-plan.md): иначе первый
// клиентский рендер сносит снапшот и рисует «Загрузка…», а это и прыжок
// разметки (CLS 0,221 в отчёте PageSpeed), и пустой экран на секунду-две.
// Ожидание идёт ПАРАЛЛЕЛЬНО отрисовке снапшота, не после неё, и у него свой
// таймаут внутри — на страницах без этих данных не стоит ни миллисекунды.
Promise.all([waitForPrerenderedPaint(), primeBusinessCentersFromBuild()]).then(() => {
  const root = createRoot(container)
  const tree = (
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>
  )
  // Поверх снапшота — рендер-переход, а не обычный: React строит дерево
  // кусками по ~5 мс, уступая поток между ними, и только готовый результат
  // одним коммитом подменяет снапшот (до коммита на экране остаётся он).
  // Обычный root.render — одна задача на всё дерево: 175–275 мс на
  // каталоге и карточке БЦ при 3× замедлении процессора, главный вклад
  // нашего кода в TBT отчёта PageSpeed (десктоп каталога — 410 мс,
  // 2026-09-23). Пустому шеллу (админка) ждать нечего — там как раньше.
  if (container.hasChildNodes()) startTransition(() => root.render(tree))
  else root.render(tree)
  // ErrorBoundary.componentDidCatch перезагружает страницу один раз за
  // сессию вкладки при первом же непойманном крахе (см. комментарий в самом
  // компоненте) — снимаем этот флаг спустя несколько секунд успешной работы,
  // чтобы СЛЕДУЮЩИЙ, отдельный крах (даже позже в той же вкладке) снова
  // получил свою "тихую" попытку, а не сразу экран с кнопкой.
  setTimeout(clearCrashReloadFlag, 5000)
  initSentryWhenIdle()
})
