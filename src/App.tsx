import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { RequirePage } from './components/layout/RequirePage';
import { PublicBuildingPlan } from './pages/PublicBuildingPlan';
import { ObjectLandingPage } from './pages/ObjectLandingPage';
import { DistrictGuidePage } from './pages/DistrictGuidePage';
import { BriefPublicPage } from './pages/BriefPublicPage';
import { MeetingSummaryPublicPage } from './pages/MeetingSummaryPublicPage';
import { NotFound } from './pages/NotFound';

// Вся админка (CRM с десятком разделов — финмодели, сметы, документы и т.д.)
// нужна только за PasswordGate на /admin/*, но раньше грузилась тем же JS-
// бандлом, что и продающая страница объекта — посетитель лендинга скачивал
// весь код CRM, даже никогда его не открыв. lazy() выносит каждую админ-
// страницу в свой чанк, догружаемый при переходе в /admin — публичные
// страницы (лендинг объекта и три токенизированные, см. Routes ниже) этого
// веса больше не тащат.
const AppLayout = lazy(() => import('./components/layout/AppLayout').then((m) => ({ default: m.AppLayout })));
const PasswordGate = lazy(() => import('./components/layout/PasswordGate').then((m) => ({ default: m.PasswordGate })));
const AdminIndex = lazy(() => import('./pages/AdminIndex').then((m) => ({ default: m.AdminIndex })));
const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })));
const Transactions = lazy(() => import('./pages/Transactions').then((m) => ({ default: m.Transactions })));
const TransactionsReport = lazy(() => import('./pages/TransactionsReport').then((m) => ({ default: m.TransactionsReport })));
const Leads = lazy(() => import('./pages/Leads').then((m) => ({ default: m.Leads })));
const Contractors = lazy(() => import('./pages/Contractors').then((m) => ({ default: m.Contractors })));
const Objects = lazy(() => import('./pages/Objects').then((m) => ({ default: m.Objects })));
const ObjectDetail = lazy(() => import('./pages/ObjectDetail').then((m) => ({ default: m.ObjectDetail })));
const Documents = lazy(() => import('./pages/Documents').then((m) => ({ default: m.Documents })));
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
const MarketOffersReview = lazy(() => import('./pages/MarketOffersReview').then((m) => ({ default: m.MarketOffersReview })));
const DesignProjectView = lazy(() => import('./pages/DesignProjectView').then((m) => ({ default: m.DesignProjectView })));
const DesignProjectDetail = lazy(() => import('./pages/DesignProjectDetail').then((m) => ({ default: m.DesignProjectDetail })));
const MoodboardView = lazy(() => import('./pages/MoodboardView').then((m) => ({ default: m.MoodboardView })));
const MoodboardDetail = lazy(() => import('./pages/MoodboardDetail').then((m) => ({ default: m.MoodboardDetail })));
const MeetingSummaries = lazy(() => import('./pages/MeetingSummaries').then((m) => ({ default: m.MeetingSummaries })));
const MeetingSummaryDetail = lazy(() => import('./pages/MeetingSummaryDetail').then((m) => ({ default: m.MeetingSummaryDetail })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

// Случайный щипок двумя пальцами (обычный жест при скролле телефоном,
// держа его двумя руками) зумит всю страницу нативным зумом Safari — и этот
// зум остаётся, пока клиент не сведёт пальцы обратно вручную, а верстка
// после него местами едет. viewport-мета (maximum-scale/user-scalable) для
// этого ненадёжен: современный iOS Safari игнорирует user-scalable=no.
// Единственный рабочий способ — как и в зуме планировки (BuildingPlanCanvas) —
// перехватывать многопальцевый touchmove на уровне всего документа. Двойной
// тап (зум планировки) не задет: там всегда одно касание за раз.
function usePreventPageZoom() {
  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length > 1) e.preventDefault();
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => document.removeEventListener('touchmove', onTouchMove);
  }, []);
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

export default function App() {
  usePreventPageZoom();
  return (
    <Routes>
      {/* Публичная часть — без AppLayout и без пароля, для клиентов и рекламы.
          Пока нет отдельного лендинга компании, голый домен ведёт сразу на
          продающую страницу объекта "Полтавская" (см. RealtyObject.landingSlug).
          Импортированы статически (не lazy) — это ровно те страницы, ради
          которых существует бандл-сплиттинг выше: им нельзя добавлять лишний
          сетевой перелёт на догрузку чанка. */}
      <Route path="/" element={<Navigate to="/one" replace />} />
      <Route path="/rayon-minsk-mir" element={<DistrictGuidePage />} />
      <Route path="/plan/:token" element={<PublicBuildingPlan />} />
      <Route path="/tz/:token" element={<BriefPublicPage />} />
      <Route path="/summary/:token" element={<MeetingSummaryPublicPage />} />
      <Route path="/:slug" element={<ObjectLandingPage />} />

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
        <Route
          path="market-offers"
          element={
            <RequirePage page="marketOffers">
              <MarketOffersReview />
            </RequirePage>
          }
        />
        <Route path="contractors" element={<RequirePage page="contractors"><Contractors /></RequirePage>} />
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
  );
}
