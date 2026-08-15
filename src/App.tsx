import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PasswordGate } from './components/layout/PasswordGate';
import { Home } from './pages/Home';
import { Transactions } from './pages/Transactions';
import { Leads } from './pages/Leads';
import { Objects } from './pages/Objects';
import { ObjectDetail } from './pages/ObjectDetail';
import { Documents } from './pages/Documents';
import { Tasks } from './pages/Tasks';
import { Backlog } from './pages/Backlog';
import { PublicBuildingPlan } from './pages/PublicBuildingPlan';
import { ObjectLandingPage } from './pages/ObjectLandingPage';
import { NotFound } from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      {/* Публичная часть — без AppLayout и без пароля, для клиентов и рекламы.
          Пока нет отдельного лендинга компании, голый домен ведёт сразу на
          продающую страницу объекта "Полтавская" (см. RealtyObject.landingSlug). */}
      <Route path="/" element={<Navigate to="/one" replace />} />
      <Route path="/plan/:token" element={<PublicBuildingPlan />} />
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
        <Route path="objects" element={<Objects />} />
        <Route path="objects/:id" element={<ObjectDetail />} />
        <Route path="documents" element={<Documents />} />
        <Route path="backlog" element={<Backlog />} />
      </Route>
      {/* Любой нераспознанный путь (в т.ч. испорченная публичная ссылка) не должен
          проваливаться в CRM — раньше он попадал на Home внутри AppLayout. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
