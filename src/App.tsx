import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PasswordGate } from './components/layout/PasswordGate';
import { Home } from './pages/Home';
import { Transactions } from './pages/Transactions';
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
import { MeetingSummaries } from './pages/MeetingSummaries';
import { MeetingSummaryDetail } from './pages/MeetingSummaryDetail';
import { MeetingSummaryPublicPage } from './pages/MeetingSummaryPublicPage';
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
        <Route index element={<Tasks />} />
        <Route path="dashboard" element={<Home />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="leads" element={<Leads />} />
        <Route path="contractors" element={<Contractors />} />
        <Route path="objects" element={<Objects />} />
        <Route path="objects/:id" element={<ObjectDetail />} />
        <Route path="tz" element={<Briefs />} />
        <Route path="estimates" element={<Estimates />} />
        <Route path="estimates/:id" element={<EstimateDetail />} />
        <Route path="documents" element={<Documents />} />
        <Route path="meeting-summaries" element={<MeetingSummaries />} />
        <Route path="meeting-summaries/:id" element={<MeetingSummaryDetail />} />
        <Route path="backlog" element={<Backlog />} />
      </Route>
      {/* Любой нераспознанный путь (в т.ч. испорченная публичная ссылка) не должен
          проваливаться в CRM — раньше он попадал на Home внутри AppLayout. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
