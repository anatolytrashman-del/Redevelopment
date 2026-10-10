import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { RequirePage } from './components/layout/RequirePage';
import { RequireSuperAdmin } from './components/layout/RequireSuperAdmin';
import { useParams } from 'react-router-dom';
import { PublicBuildingPlan } from './pages/PublicBuildingPlan';
import { ObjectLandingPage } from './pages/ObjectLandingPage';
import { DistrictGuidePage } from './pages/DistrictGuidePage';
import { MinskMirTopicPage } from './pages/MinskMirTopicPage';
import { BusinessCentersMinskPage } from './pages/BusinessCentersMinskPage';
import { BusinessCentersRankingPage } from './pages/BusinessCentersRankingPage';
import { BusinessCentersBiggestPage } from './pages/BusinessCentersBiggestPage';
import { BusinessCentersRankingBPlusPage } from './pages/BusinessCentersRankingBPlusPage';
import { BusinessCentersRankingBCPage } from './pages/BusinessCentersRankingBCPage';
import { BusinessCentersAffordablePage } from './pages/BusinessCentersAffordablePage';
import { BusinessCentersGuidePage } from './pages/BusinessCentersGuidePage';
import { BusinessCentersAnalyticsPage } from './pages/BusinessCentersAnalyticsPage';
import { BusinessCenterDetailPage } from './pages/BusinessCenterDetailPage';
import { TradeCentersRankingPage } from './pages/TradeCentersRankingPage';
import { TradeCentersBiggestPage } from './pages/TradeCentersBiggestPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { MinskHub } from './pages/MinskHub';
import { MarketAnalyticsHub } from './pages/MarketAnalyticsHub';
import { OfficeAnalyticsPage } from './pages/OfficeAnalyticsPage';
import { RetailAnalyticsPage } from './pages/RetailAnalyticsPage';
import { WarehouseAnalyticsPage } from './pages/WarehouseAnalyticsPage';
import { ParkingAnalyticsPage } from './pages/ParkingAnalyticsPage';
import { MinskMirAnalyticsPage } from './pages/MinskMirAnalyticsPage';
import { DistrictsAnalyticsPage } from './pages/DistrictsAnalyticsPage';
import { AnalyticsMethodologyPage } from './pages/AnalyticsMethodologyPage';
import { BriefPublicPage } from './pages/BriefPublicPage';
import { MeetingSummaryPublicPage } from './pages/MeetingSummaryPublicPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { NotFound } from './pages/NotFound';
import { CookieBanner } from './components/layout/CookieBanner';
import { metrikaHit } from './lib/metrika';
import { vkPixelHit, vkPixelGoal, vkPageGoalForPath } from './lib/vkPixel';
import { useOnlinePresenceTracker } from './lib/onlinePresence';
import { trackPageView } from './lib/pageViewTracker';
import { FavoritesProvider } from './lib/favoritesContext';
import { CatalogKindProvider } from './lib/catalogKind';
import { deployedSiteMode } from './lib/sites';

// Вся админка (CRM с десятком разделов — финмодели, сметы, документы и т.д.)
// нужна только за PasswordGate на /admin/*, но раньше грузилась тем же JS-
// бандлом, что и продающая страница объекта — посетитель лендинга скачивал
// весь код CRM, даже никогда его не открыв. lazy() выносит каждую админ-
// страницу в свой чанк, догружаемый при переходе в /admin — публичные
// страницы (лендинг объекта и три токенизированные, см. Routes ниже) этого
// веса больше не тащат.
//
// PAGESPEED_PLAN.md, Э7 — публичные страницы ОДИН РАЗ переводились на
// lazy() (та же схема, что у админки) и были отменены: реальный прогон
// PageSpeed на проде показал, что это УХУДШИЛО LCP/FCP/SI (например LCP
// 4,4с → 5,7с), хотя главный чанк формально стал вдвое легче. Причина —
// приложение не делает настоящую SSR-гидратацию (`main.tsx`: `createRoot`,
// не `hydrateRoot`), пререндер-снапшот (Э0) — это просто статический HTML
// для первой краски и краулеров, а не разметка, которую React подхватывает
// без пересборки. Как только грузится JS, React рендерит дерево заново с
// нуля поверх этого HTML — при обычном (не-lazy) компоненте страницы это
// происходит за один кадр и незаметно (итоговый DOM совпадает с уже
// показанным), а если КОРНЕВОЙ компонент страницы — lazy(), React обязан
// сначала показать Suspense fallback (спиннер), СТИРАЯ уже видимый
// пререндеренный контент, и только после догрузки чанка отрисовать
// страницу заново — это и есть реальный лишний "Element render delay"
// (в отчёте вырос с ~100мс до ~1870мс), который целиком съедает выигрыш
// от пререндера. lazy() безопасен для админ-страниц (там нет пререндер-
// снапшота, стирать нечего) и для второстепенных публичных путей без
// собственного пререндера (BusinessUploadPublicPage/EstimatePublicPage
// ниже — токен-страницы для одного исполнителя, не для посетителей с
// поиска) — но не для страниц, ради которых и делался Э0.
const AppLayout = lazy(() => import('./components/layout/AppLayout').then((m) => ({ default: m.AppLayout })));
const PasswordGate = lazy(() => import('./components/layout/PasswordGate').then((m) => ({ default: m.PasswordGate })));
const AdminIndex = lazy(() => import('./pages/AdminIndex').then((m) => ({ default: m.AdminIndex })));
const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })));
const Transactions = lazy(() => import('./pages/Transactions').then((m) => ({ default: m.Transactions })));
const TransactionsReport = lazy(() => import('./pages/TransactionsReport').then((m) => ({ default: m.TransactionsReport })));
const Leads = lazy(() => import('./pages/Leads').then((m) => ({ default: m.Leads })));
const Contractors = lazy(() => import('./pages/Contractors').then((m) => ({ default: m.Contractors })));
// "Закупки" (в меню; 2026-09-03 — 2026-09-12 пункт назывался "Поставщики",
// см. data/pages.ts) — компонент по историческим причинам называется
// Suppliers, см. комментарий в самом файле. Вкладку "Закупки" (Purchases.tsx)
// убрали 2026-09-03, сам файл удалён в шаге 11b плана закупок — заказ
// поставщику теперь отдельная сущность (data/purchaseOrders.ts).
const Suppliers = lazy(() => import('./pages/Suppliers').then((m) => ({ default: m.Suppliers })));
const SupplierDetail = lazy(() => import('./pages/SupplierDetail').then((m) => ({ default: m.SupplierDetail })));
const WorkContractors = lazy(() => import('./pages/WorkContractors').then((m) => ({ default: m.WorkContractors })));
const Mail = lazy(() => import('./pages/Mail').then((m) => ({ default: m.Mail })));
const Objects = lazy(() => import('./pages/Objects').then((m) => ({ default: m.Objects })));
const ObjectDetail = lazy(() => import('./pages/ObjectDetail').then((m) => ({ default: m.ObjectDetail })));
const Documents = lazy(() => import('./pages/Documents').then((m) => ({ default: m.Documents })));
const LegalEntityDetail = lazy(() =>
  import('./pages/LegalEntityDetail').then((m) => ({ default: m.LegalEntityDetail })),
);
const Tasks = lazy(() => import('./pages/Tasks').then((m) => ({ default: m.Tasks })));
const Backlog = lazy(() => import('./pages/Backlog').then((m) => ({ default: m.Backlog })));
const Briefs = lazy(() => import('./pages/Briefs').then((m) => ({ default: m.Briefs })));
const Estimates = lazy(() => import('./pages/Estimates').then((m) => ({ default: m.Estimates })));
const EstimateDetail = lazy(() => import('./pages/EstimateDetail').then((m) => ({ default: m.EstimateDetail })));
const FinModels = lazy(() => import('./pages/FinModels').then((m) => ({ default: m.FinModels })));
const FinModelDetail = lazy(() => import('./pages/FinModelDetail').then((m) => ({ default: m.FinModelDetail })));
const FinModelReport = lazy(() => import('./pages/FinModelReport').then((m) => ({ default: m.FinModelReport })));
const Financing = lazy(() => import('./pages/Financing').then((m) => ({ default: m.Financing })));
const DesignProjects = lazy(() => import('./pages/DesignProjects').then((m) => ({ default: m.DesignProjects })));
const Landings = lazy(() => import('./pages/Landings').then((m) => ({ default: m.Landings })));
// "Показатели" (посещаемость сайта из Яндекс.Метрики) — SiteMetrics/
// site-metrics, НЕ Metrics/metrics (та страница — про другое, см. её же
// комментарий и комментарий у data/pages.ts).
const SiteMetrics = lazy(() => import('./pages/SiteMetrics').then((m) => ({ default: m.SiteMetrics })));
const MarketOffersReview = lazy(() => import('./pages/MarketOffersReview').then((m) => ({ default: m.MarketOffersReview })));
const ActivityLog = lazy(() => import('./pages/ActivityLog').then((m) => ({ default: m.ActivityLog })));
const Metrics = lazy(() => import('./pages/Metrics').then((m) => ({ default: m.Metrics })));
const DesignProjectView = lazy(() => import('./pages/DesignProjectView').then((m) => ({ default: m.DesignProjectView })));
const DesignProjectDetail = lazy(() => import('./pages/DesignProjectDetail').then((m) => ({ default: m.DesignProjectDetail })));
const MoodboardView = lazy(() => import('./pages/MoodboardView').then((m) => ({ default: m.MoodboardView })));
const MoodboardDetail = lazy(() => import('./pages/MoodboardDetail').then((m) => ({ default: m.MoodboardDetail })));
const MeetingSummaries = lazy(() => import('./pages/MeetingSummaries').then((m) => ({ default: m.MeetingSummaries })));
const MeetingSummaryDetail = lazy(() => import('./pages/MeetingSummaryDetail').then((m) => ({ default: m.MeetingSummaryDetail })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

// Публичная (без PasswordGate) страница для фрилансера — см. её же
// комментарий. lazy(), а не статический импорт как у остальных публичных
// страниц выше: она тянет за собой разбор .webarchive/bplist, этот код не
// должен попадать в основной бандл продающих лендингов ради одной
// рабочей ссылки для одного исполнителя.
const BusinessUploadPublicPage = lazy(() =>
  import('./pages/BusinessUploadPublicPage').then((m) => ({ default: m.BusinessUploadPublicPage })),
);

// Публичная ссылка на построчную смету для строителя (Артём и т.п.) — тот
// же принцип, что и у BusinessUploadPublicPage выше: lazy(), а не статический
// импорт, потому что тянет за собой EstimateLineItemsTable/FormModal/
// CommentsModal (иначе те же компоненты дублировались бы в основной бандл
// продающих лендингов, хотя уже есть в чанке /admin/estimates).
const EstimatePublicPage = lazy(() =>
  import('./pages/EstimatePublicPage').then((m) => ({ default: m.EstimatePublicPage })),
);

// Случайный щипок двумя пальцами (обычный жест при скролле телефоном,
// держа его двумя руками) зумит всю страницу нативным зумом Safari — и этот
// зум остаётся, пока клиент не сведёт пальцы обратно вручную, а верстка
// после него местами едет. viewport-мета (maximum-scale/user-scalable) для
// этого ненадёжен: современный iOS Safari игнорирует user-scalable=no.
// Единственный рабочий способ — как и в зуме планировки (BuildingPlanCanvas) —
// перехватывать многопальцевый touchmove на уровне всего документа. Двойной
// тап (зум планировки) не задет: там всегда одно касание за раз.
// 2026-08-26 (мобильная оптимизация /minsk/minsk-mir) — этот же перехват
// глушил щипок ВНУТРИ виджетов Яндекс.Карт (DistrictMap/DistrictQuarterMap —
// единственные потребители ymaps в приложении), их собственный зум карты
// тоже двупальцевый жест. closest('[data-allow-pinch-zoom]') — явное
// исключение: элемент с этим атрибутом сам управляет своим содержимым
// (карта), глобальная защита от зума СТРАНИЦЫ ему не нужна и мешает.
function usePreventPageZoom() {
  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length <= 1) return;
      if ((e.target as Element | null)?.closest('[data-allow-pinch-zoom]')) return;
      e.preventDefault();
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => document.removeEventListener('touchmove', onTouchMove);
  }, []);
}

// Яндекс.Метрика и VK-пиксель (Top.Mail.Ru, index.html) сами считают
// только ПЕРВУЮ загрузку страницы — SPA-переходы react-router не порождают
// новых просмотров, внутренняя навигация (в т.ч. конверсионный переход гид
// района → /minsk/one) была невидима в статистике обоих. Штатный для SPA
// способ — вручную слать pageview на каждую смену маршрута; первую загрузку
// пропускаем, её уже засчитал init обоих счётчиков.
//
// 2026-09-10: /admin/* — внутренняя CRM, не то, что владелец хочет видеть в
// «Показателях» как клиентский трафик (Светлана/Альмира целый день листают
// задачи/сметы — это не посетители сайта). Хиты с /admin не шлём вовсе, ни
// в Метрику, ни в VK-пиксель (тот же принцип: retargeting-аудитория VK-рекламы
// не должна пополняться сотрудниками CRM). Сам счётчик на /admin может быть и
// не инициализирован (см. index.html) — тогда metrikaHit()/vkPixelHit() и так
// молча ничего не делают (см. их же optional chaining), эта проверка не
// единственная защита, а явная и быстрая, без похода в чужой модуль.
function useSpaPageviewHits() {
  const location = useLocation();
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (location.pathname.startsWith('/admin')) return;
    metrikaHit(location.pathname + location.search);
    vkPixelHit();
  }, [location.pathname, location.search]);
}

// Собственный счётчик посещаемости без cookie (владелец, 2026-09-28) —
// src/lib/pageViewTracker.ts, таблица page_views_daily. Зависимость только
// от pathname (не search/hash), как и просит ТЗ трекера: смена query-строки
// или якоря внутри той же страницы — не новый просмотр. isFirstRender не
// нужен (в отличие от useSpaPageviewHits выше) — первую страницу загрузки
// документа тоже нужно посчитать, сам трекер и определяет по ней visit-entry.
function useOwnPageViewCounter() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);
}

// VK-аудитории по конкретным страницам (см. lib/vkPixel.ts) — в отличие
// от общего pageview выше, здесь ПЕРВЫЙ рендер не пропускается: обычный
// init пикселя сам такое именованное событие не шлёт, только generic
// "Посещение сайта", а нам нужно засчитать и прямой заход на страницу, не
// только переход внутри SPA.
function useVkPageGoals() {
  const location = useLocation();
  useEffect(() => {
    const goal = vkPageGoalForPath(location.pathname);
    if (goal) vkPixelGoal(goal);
  }, [location.pathname]);
}

// Индикатор "сколько человек онлайн" в админке (Sidebar, только для
// Трэшмена) — джойним presence-канал на всех маркетинговых страницах, тот
// же критерий "не /admin", что и у pageview-хитов выше. Флаг, а не
// pathname целиком, чтобы не перезаходить в канал на каждый переход внутри
// публичной части — только когда реально пересекаем границу с /admin.
// Переход по ссылке внутри SPA скролл не трогает: новый маршрут
// открывается на той же высоте, где пользователь стоял. На длинных
// страницах это ломает навигацию — блок рекомендаций («Похожие БЦ»,
// BusinessCenterDetailPage) живёт в самом низу, и соседний БЦ открывался
// сразу на отзывах, а не с начала (владелец, 2026-09-22, скриншот
// мобильной версии). Наверх мотаем только на PUSH:
//   • POP (кнопки «назад»/«вперёд») — позицию восстанавливает сам браузер,
//     history.scrollRestoration мы не отключаем;
//   • REPLACE — это фильтры каталога: BusinessCentersMinskPage на каждый
//     клик по чипу меняет ПУТЬ (хаб-урл класса/района) с replace: true,
//     и прыжок в начало страницы там был бы хуже, чем его отсутствие.
// Ссылка с якорем (#...) ведёт внутрь страницы — её тоже не трогаем.
function useScrollToTopOnNavigate() {
  const location = useLocation();
  const navigationType = useNavigationType();
  // useLayoutEffect, а не useEffect: скроллим до первой отрисовки нового
  // маршрута, иначе кадр со старой позицией успевает мелькнуть.
  useLayoutEffect(() => {
    if (navigationType !== 'PUSH') return;
    if (location.hash) return;
    window.scrollTo(0, 0);
  }, [location.pathname, location.hash, navigationType]);
}

function useOnlineVisitorPresence() {
  const location = useLocation();
  useOnlinePresenceTracker(!location.pathname.startsWith('/admin'));
}

// Старые ссылки без /minsk (индексировались недолго, до переезда на
// city-scoped структуру урлов — см. docs/session-journal.md) — /one, /redstorage и любой
// будущий объект по тому же паттерну автоматически редиректятся на новый
// адрес. /rayon-minsk-mir — особый случай (слаг переименован в minsk-mir,
// не просто добавлен префикс), у него свой отдельный редирект ниже.
function LegacySlugRedirect() {
  const { legacySlug } = useParams();
  return <Navigate to={`/minsk/${legacySlug}`} replace />;
}

// Фолбэк на время догрузки чанка админки (см. lazy() выше) — только для
// /admin/*, публичные страницы импортированы статически и его не видят.
function AdminChunkFallback() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
    </div>
  );
}

/** Маршруты отдельного проекта malllist.pro — каталог ТЦ (как officelist → БЦ). */
function MalllistRoutes() {
  return (
    <Routes>
      {/* / — SPA-редирект на каталог; middleware не делает 307, чтобы meta
          yandex-verification на корне оставалась читаемой (как у officelist). */}
      <Route path="/" element={<Navigate to="/minsk/tc" replace />} />
      <Route path="/minsk" element={<Navigate to="/minsk/tc" replace />} />
      <Route path="/minsk/tc" element={<CatalogKindProvider kind="tc"><BusinessCentersMinskPage /></CatalogKindProvider>} />
      <Route path="/minsk/tc/rating" element={<CatalogKindProvider kind="tc"><TradeCentersRankingPage /></CatalogKindProvider>} />
      <Route
        path="/minsk/tc/rating/largest"
        element={<CatalogKindProvider kind="tc"><TradeCentersBiggestPage /></CatalogKindProvider>}
      />
      <Route
        path="/minsk/tc/district/:districtSlug"
        element={<CatalogKindProvider kind="tc"><BusinessCentersMinskPage /></CatalogKindProvider>}
      />
      <Route
        path="/minsk/tc/metro/:metroSlug"
        element={<CatalogKindProvider kind="tc"><BusinessCentersMinskPage /></CatalogKindProvider>}
      />
      <Route
        path="/minsk/tc/format/:formatSlug"
        element={<CatalogKindProvider kind="tc"><BusinessCentersMinskPage /></CatalogKindProvider>}
      />
      <Route
        path="/minsk/tc/with/:topicSlug"
        element={<CatalogKindProvider kind="tc"><BusinessCentersMinskPage /></CatalogKindProvider>}
      />
      <Route
        path="/minsk/tc/store/:storeSlug"
        element={<CatalogKindProvider kind="tc"><BusinessCentersMinskPage /></CatalogKindProvider>}
      />
      <Route path="/minsk/tc/:slug" element={<CatalogKindProvider kind="tc"><BusinessCenterDetailPage /></CatalogKindProvider>} />
      <Route path="/favorites/:id" element={<FavoritesPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

/**
 * Общие маршруты каталога БЦ — фрагмент (не компонент): `<Routes>` разворачивает
 * только Fragment/Route как прямых детей, кастомный компонент не видит.
 * ФАЙЛ-БЛИЗНЕЦ: односегментные /minsk/bc/<слово> ↔ sections в index.html
 * (тест src/lib/businessCentersApi.test.ts).
 */
const businessCenterCatalogRoutes = (
  <>
    <Route path="/minsk/bc" element={<BusinessCentersMinskPage />} />
    <Route path="/minsk/bc/new" element={<BusinessCentersMinskPage underConstruction />} />
    <Route path="/minsk/bc/rating" element={<BusinessCentersRankingPage />} />
    <Route path="/minsk/bc/rating/largest" element={<BusinessCentersBiggestPage />} />
    <Route path="/minsk/bc/rating/class-b-plus" element={<BusinessCentersRankingBPlusPage />} />
    <Route path="/minsk/bc/rating/class-b-c" element={<BusinessCentersRankingBCPage />} />
    <Route path="/minsk/bc/rating/affordable" element={<BusinessCentersAffordablePage />} />
    <Route path="/minsk/bc/guide" element={<BusinessCentersGuidePage />} />
    <Route path="/minsk/bc/analytics" element={<BusinessCentersAnalyticsPage />} />
    <Route path="/minsk/bc/class/:classSlug" element={<BusinessCentersMinskPage />} />
    <Route path="/minsk/bc/district/:districtSlug" element={<BusinessCentersMinskPage />} />
    <Route path="/minsk/bc/class/:classSlug/district/:districtSlug" element={<BusinessCentersMinskPage />} />
    <Route path="/minsk/bc/area/:microdistrictSlug" element={<BusinessCentersMinskPage />} />
    <Route path="/minsk/bc/metro/:metroSlug" element={<BusinessCentersMinskPage />} />
    <Route path="/minsk/bc/street/:streetSlug" element={<BusinessCentersMinskPage />} />
    <Route path="/minsk/bc/:slug" element={<BusinessCenterDetailPage />} />
    <Route path="/bc/:slug" element={<BusinessCenterDetailPage ownerMode />} />
  </>
);

/** Маршруты отдельного проекта officelist.pro — каталог БЦ + аналитика Минск Мира. */
function OfficelistRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/minsk/bc" replace />} />
      <Route path="/minsk" element={<Navigate to="/minsk/bc" replace />} />
      {businessCenterCatalogRoutes}
      <Route path="/minsk/analytics/minsk-mir" element={<MinskMirAnalyticsPage />} />
      <Route path="/favorites/:id" element={<FavoritesPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  usePreventPageZoom();
  useScrollToTopOnNavigate();
  useSpaPageviewHits();
  useVkPageGoals();
  useOnlineVisitorPresence();
  useOwnPageViewCounter();

  // Отдельный Vercel-проект malllist: env VITE_PUBLIC_SITE=malls.
  if (deployedSiteMode() === 'malls') {
    return (
      <FavoritesProvider>
        <MalllistRoutes />
        <CookieBanner />
      </FavoritesProvider>
    );
  }

  // Отдельный Vercel-проект officelist: env VITE_PUBLIC_SITE=offices.
  if (deployedSiteMode() === 'offices') {
    return (
      <FavoritesProvider>
        <OfficelistRoutes />
        <CookieBanner />
      </FavoritesProvider>
    );
  }

  return (
    <FavoritesProvider>
    <Routes>
      {/* Публичная часть — без AppLayout и без пароля, для клиентов и рекламы.
          Пока нет отдельного лендинга компании (см. SEO_PLAN.md, Э2-4), корень
          временно ведёт на /minsk — city-scoped раздел (гиды по районам),
          готовый к появлению других городов рядом без
          переезда уже проиндексированных ссылок под /minsk. Импортированы
          статически (не lazy) — это ровно те страницы, ради которых существует
          бандл-сплиттинг выше: им нельзя добавлять лишний сетевой перелёт на
          догрузку чанка. */}
      <Route path="/" element={<Navigate to="/minsk" replace />} />
      <Route path="/minsk" element={<MinskHub />} />
      {/* Аналитика рынка (ANALYTICSPLAN.md) — бенчмарк-страницы с постоянным
          URL, месяц меняется в тексте, не в адресе. Регистрируются раньше
          "/minsk/:slug" (лендинг объекта) ниже, чтобы не конфликтовать. */}
      <Route path="/minsk/analytics" element={<MarketAnalyticsHub />} />
      <Route path="/minsk/analytics/metodika" element={<AnalyticsMethodologyPage />} />
      <Route path="/minsk/analytics/ofisy/arenda" element={<OfficeAnalyticsPage deal="rent" />} />
      <Route path="/minsk/analytics/ofisy/prodazha" element={<OfficeAnalyticsPage deal="sale" />} />
      <Route path="/minsk/analytics/torgovye/arenda" element={<RetailAnalyticsPage deal="rent" />} />
      <Route path="/minsk/analytics/torgovye/prodazha" element={<RetailAnalyticsPage deal="sale" />} />
      <Route path="/minsk/analytics/sklady/arenda" element={<WarehouseAnalyticsPage deal="rent" />} />
      <Route path="/minsk/analytics/sklady/prodazha" element={<WarehouseAnalyticsPage deal="sale" />} />
      <Route path="/minsk/analytics/mashinomesta/arenda" element={<ParkingAnalyticsPage deal="rent" />} />
      <Route path="/minsk/analytics/mashinomesta/prodazha" element={<ParkingAnalyticsPage deal="sale" />} />
      <Route path="/minsk/analytics/minsk-mir" element={<MinskMirAnalyticsPage />} />
      <Route path="/minsk/analytics/rajony" element={<DistrictsAnalyticsPage />} />
      <Route path="/minsk/minsk-mir" element={<DistrictGuidePage />} />
      <Route path="/minsk/minsk-mir/:topic" element={<MinskMirTopicPage />} />
      {businessCenterCatalogRoutes}
      {/* Каталог торговых центров (2026-09-23) — те же компоненты, что у
          каталога БЦ, со словарём и корнем /minsk/tc (src/lib/catalogKind.tsx).
          Оси: район, метро, формат, тематические /with/*, магазины /store/*; рейтинги
          — отдельные страницы (2026-10-04). */}
      <Route path="/minsk/tc" element={<CatalogKindProvider kind="tc"><BusinessCentersMinskPage /></CatalogKindProvider>} />
      <Route path="/minsk/tc/rating" element={<CatalogKindProvider kind="tc"><TradeCentersRankingPage /></CatalogKindProvider>} />
      <Route
        path="/minsk/tc/rating/largest"
        element={<CatalogKindProvider kind="tc"><TradeCentersBiggestPage /></CatalogKindProvider>}
      />
      <Route
        path="/minsk/tc/district/:districtSlug"
        element={<CatalogKindProvider kind="tc"><BusinessCentersMinskPage /></CatalogKindProvider>}
      />
      <Route
        path="/minsk/tc/metro/:metroSlug"
        element={<CatalogKindProvider kind="tc"><BusinessCentersMinskPage /></CatalogKindProvider>}
      />
      {/* Подборки по формату: «Рынки», «Мебельные центры», «Аутлеты» (2026-09-30), см. TC_FORMAT_HUBS. */}
      <Route
        path="/minsk/tc/format/:formatSlug"
        element={<CatalogKindProvider kind="tc"><BusinessCentersMinskPage /></CatalogKindProvider>}
      />
      {/* Тематические подборки /with/* (2026-10-04), см. TC_TOPIC_HUBS. */}
      <Route
        path="/minsk/tc/with/:topicSlug"
        element={<CatalogKindProvider kind="tc"><BusinessCentersMinskPage /></CatalogKindProvider>}
      />
      {/* Магазины /store/* — все бренды из tc-filters (2026-10-04). */}
      <Route
        path="/minsk/tc/store/:storeSlug"
        element={<CatalogKindProvider kind="tc"><BusinessCentersMinskPage /></CatalogKindProvider>}
      />
      <Route path="/minsk/tc/:slug" element={<CatalogKindProvider kind="tc"><BusinessCenterDetailPage /></CatalogKindProvider>} />
      <Route path="/plan/:token" element={<PublicBuildingPlan />} />
      <Route path="/tz/:token" element={<BriefPublicPage />} />
      <Route path="/summary/:token" element={<MeetingSummaryPublicPage />} />
      {/* Избранное без регистрации (владелец, 2026-09-21) — короткий id в
          URL, открывается на любом устройстве по той же ссылке. */}
      <Route path="/favorites/:id" element={<FavoritesPage />} />
      <Route
        path="/business-upload"
        element={
          <Suspense fallback={<AdminChunkFallback />}>
            <BusinessUploadPublicPage />
          </Suspense>
        }
      />
      <Route
        path="/estimate/:token"
        element={
          <Suspense fallback={<AdminChunkFallback />}>
            <EstimatePublicPage />
          </Suspense>
        }
      />
      <Route path="/minsk/:slug" element={<ObjectLandingPage />} />
      {/* Политика конфиденциальности (владелец, 2026-09-25) — статический
          односегментный путь, регистрируется ДО "/:legacySlug" ниже: иначе
          общий catch-all принял бы /privacy за старый слаг объекта и увёл
          бы на /minsk/privacy. */}
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      {/* Старые адреса без /minsk — см. LegacySlugRedirect выше. */}
      <Route path="/rayon-minsk-mir" element={<Navigate to="/minsk/minsk-mir" replace />} />
      <Route path="/:legacySlug" element={<LegacySlugRedirect />} />

      {/* Админка теперь живёт под /admin, а не на голом домене — корень
          зарезервирован под продающие страницы объектов. */}
      <Route
        path="/admin"
        element={
          <Suspense fallback={<AdminChunkFallback />}>
            <PasswordGate>
              <AppLayout />
            </PasswordGate>
          </Suspense>
        }
      >
        <Route index element={<AdminIndex />} />
        <Route path="dashboard" element={<RequirePage page="dashboard"><Home /></RequirePage>} />
        <Route path="tasks" element={<RequirePage page="tasks"><Tasks /></RequirePage>} />
        <Route path="transactions" element={<RequirePage page="transactions"><Transactions /></RequirePage>} />
        <Route
          path="transactions/report"
          element={
            <RequirePage page="transactions">
              <TransactionsReport />
            </RequirePage>
          }
        />
        <Route path="leads" element={<RequirePage page="leads"><Leads /></RequirePage>} />
        <Route path="landings" element={<RequirePage page="landings"><Landings /></RequirePage>} />
        <Route path="site-metrics" element={<RequirePage page="siteMetrics"><SiteMetrics /></RequirePage>} />
        <Route
          path="market-offers"
          element={
            <RequirePage page="marketOffers">
              <MarketOffersReview />
            </RequirePage>
          }
        />
        {/* Коллаборации переехали в «Почта» → вкладка «Контакты» (2026-09-16):
            редирект, чтобы старые закладки и ссылки не упирались в 404. */}
        <Route path="collaborations" element={<Navigate to="/admin/mail" replace />} />
        {/* Не в меню, не в data/pages.ts — гейт RequireSuperAdmin строже
            обычного RequirePage, не пропускает даже профили с pages:'all'
            (см. компонент и комментарий в data/accessProfiles.ts). */}
        <Route
          path="activity-log"
          element={
            <RequireSuperAdmin>
              <ActivityLog />
            </RequireSuperAdmin>
          }
        />
        {/* Метрики сотрудников — разбивка по людям (Ресерч поставщиков,
            письма, верификация объявлений; см. Metrics.tsx). Тот же принцип,
            что и у activity-log выше: не в меню, не в data/pages.ts, доступ
            только по прямому урлу. */}
        <Route
          path="metrics"
          element={
            <RequireSuperAdmin>
              <Metrics />
            </RequireSuperAdmin>
          }
        />
        {/* "Команда" (contractors) и "Закупки" (purchases — Каталог/Ресерч/
            Закупки, компонент Suppliers) — два отдельных пункта меню, не
            один слитый (владелец поправил после первой версии, 2026-08-29:
            "это страница Команда, она должна быть в меню после Объектов /
            Всё остальное — это страница Закупки в стройке"). Старый адрес
            /admin/suppliers и кратковременный /admin/work-and-supplies
            (первая, слитая версия) — редиректы, чтобы не сломать уже
            сохранённые ссылки. */}
        <Route path="contractors" element={<RequirePage page="contractors"><Contractors /></RequirePage>} />
        {/* "Почта" — общий ящик компании a@redevelopment.pro и записная
            книжка адресов (владелец, 2026-09-16), пункт меню сразу после
            "Команды". Адрес /admin/mail: /admin/mailbox не берём, чтобы не
            путать со "страницей ящика" — здесь и переписка, и книжка. */}
        <Route path="mail" element={<RequirePage page="mailbox"><Mail /></RequirePage>} />
        <Route path="purchases" element={<RequirePage page="purchases"><Suppliers /></RequirePage>} />
        {/* "Подрядчики" — отдельный пункт меню в группе "Стройка" под
            "Закупками" (владелец, 2026-09-14). Успело побывать вкладкой
            внутри "Закупок" и уехать в прод в таком виде, поэтому старый
            адрес вкладки (/admin/purchases?tab=contractors) редиректим
            сюда — тем же приёмом, что и остальные переехавшие адреса выше. */}
        <Route path="work-contractors" element={<RequirePage page="workContractors"><WorkContractors /></RequirePage>} />
        <Route path="suppliers" element={<Navigate to="/admin/purchases" replace />} />
        {/* Страница компании-поставщика (шаг 3 плана закупок). Права — те же,
            что у «Закупок» (purchases): это их часть, отдельного пункта меню
            у неё нет, приходят по ссылке из каталога. Адрес /admin/suppliers
            без id так и остаётся редиректом на закупки — старые сохранённые
            ссылки не ломаем. */}
        <Route path="suppliers/:id" element={<RequirePage page="purchases"><SupplierDetail /></RequirePage>} />
        <Route path="work-and-supplies" element={<Navigate to="/admin/contractors" replace />} />
        <Route path="objects" element={<RequirePage page="objects"><Objects /></RequirePage>} />
        <Route path="objects/:id" element={<RequirePage page="objects"><ObjectDetail /></RequirePage>} />
        <Route path="tz" element={<RequirePage page="tz"><Briefs /></RequirePage>} />
        <Route path="estimates" element={<RequirePage page="estimates"><Estimates /></RequirePage>} />
        <Route path="estimates/:id" element={<RequirePage page="estimates"><EstimateDetail /></RequirePage>} />
        <Route path="finmodels" element={<RequirePage page="finModels"><FinModels /></RequirePage>} />
        <Route path="finmodels/:id" element={<RequirePage page="finModels"><FinModelDetail /></RequirePage>} />
        <Route path="finmodels/:id/report" element={<RequirePage page="finModels"><FinModelReport /></RequirePage>} />
        <Route path="financing" element={<RequirePage page="financing"><Financing /></RequirePage>} />
        <Route path="design-projects" element={<RequirePage page="designProjects"><DesignProjects /></RequirePage>} />
        <Route
          path="design-projects/:id"
          element={
            <RequirePage page="designProjects">
              <DesignProjectView />
            </RequirePage>
          }
        />
        <Route
          path="design-projects/:id/edit"
          element={
            <RequirePage page="designProjects">
              <DesignProjectDetail />
            </RequirePage>
          }
        />
        <Route
          path="design-projects/moodboards/:id"
          element={
            <RequirePage page="designProjects">
              <MoodboardView />
            </RequirePage>
          }
        />
        <Route
          path="design-projects/moodboards/:id/edit"
          element={
            <RequirePage page="designProjects">
              <MoodboardDetail />
            </RequirePage>
          }
        />
        <Route path="documents" element={<RequirePage page="documents"><Documents /></RequirePage>} />
        <Route
          path="documents/legal-entities/:id"
          element={
            <RequirePage page="documents">
              <LegalEntityDetail />
            </RequirePage>
          }
        />
        <Route
          path="meeting-summaries"
          element={
            <RequirePage page="meetingSummaries">
              <MeetingSummaries />
            </RequirePage>
          }
        />
        <Route
          path="meeting-summaries/:id"
          element={
            <RequirePage page="meetingSummaries">
              <MeetingSummaryDetail />
            </RequirePage>
          }
        />
        <Route path="settings" element={<RequirePage page="settings"><Settings /></RequirePage>} />
        <Route path="backlog" element={<RequirePage page="backlog"><Backlog /></RequirePage>} />
      </Route>
      {/* Любой нераспознанный путь (в т.ч. испорченная публичная ссылка) не должен
          проваливаться в CRM — раньше он попадал на Home внутри AppLayout. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    <CookieBanner />
    </FavoritesProvider>
  );
}
