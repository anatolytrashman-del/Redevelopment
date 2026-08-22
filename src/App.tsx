import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PasswordGate } from './components/layout/PasswordGate';
import { RequirePage } from './components/layout/RequirePage';
import { AdminIndex } from './pages/AdminIndex';
import { Home } from './pages/Home';
import { Transactions } from './pages/Transactions';
import { TransactionsReport } from './pages/TransactionsReport';
import { Leads } from './pages/Leads';
import { Contractors } from './pages/Contractors';
import { Objects } from './pages/Objects';
import { ObjectDetail } from './pages/ObjectDetail';
import { Documents } from './pages/Documents';
import { Tasks } from './pages/Tasks';
import { Backlog } from './pages/Backlog';
import { PublicBuildingPlan } from './pages/PublicBuildingPlan';
import { ObjectLandingPage } from './pages/ObjectLandingPage';
import { Briefs } from './pages/Briefs';
import { BriefPublicPage } from './pages/BriefPublicPage';
import { Estimates } from './pages/Estimates';
import { EstimateDetail } from './pages/EstimateDetail';
import { FinModels } from './pages/FinModels';
import { FinModelDetail } from './pages/FinModelDetail';
import { FinModelReport } from './pages/FinModelReport';
import { Financing } from './pages/Financing';
import { DesignProjects } from './pages/DesignProjects';
import { DesignProjectView } from './pages/DesignProjectView';
import { DesignProjectDetail } from './pages/DesignProjectDetail';
import { MoodboardDetail } from './pages/MoodboardDetail';
import { MeetingSummaries } from './pages/MeetingSummaries';
import { MeetingSummaryDetail } from './pages/MeetingSummaryDetail';
import { MeetingSummaryPublicPage } from './pages/MeetingSummaryPublicPage';
import { Settings } from './pages/Settings';
import { NotFound } from './pages/NotFound';

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

export default function App() {
  usePreventPageZoom();
  return (
    <Routes>
      {/* Публичная часть — без AppLayout и без пароля, для клиентов и рекламы.
          Пока нет отдельного лендинга компании, голый домен ведёт сразу на
          продающую страницу объекта "Полтавская" (см. RealtyObject.landingSlug). */}
      <Route path="/" element={<Navigate to="/one" replace />} />
      <Route path="/plan/:token" element={<PublicBuildingPlan />} />
      <Route path="/tz/:token" element={<BriefPublicPage />} />
      <Route path="/summary/:token" element={<MeetingSummaryPublicPage />} />
      <Route path="/:slug" element={<ObjectLandingPage />} />

      {/* Админка теперь живёт под /admin, а не на голом домене — корень
          зарезервирован под продающие страницы объектов. */}
      <Route
        path="/admin"
        element={
          <PasswordGate>
            <AppLayout />
          </PasswordGate>
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
