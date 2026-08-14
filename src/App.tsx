import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Home } from './pages/Home';
import { Transactions } from './pages/Transactions';
import { Leads } from './pages/Leads';
import { Objects } from './pages/Objects';
import { ObjectDetail } from './pages/ObjectDetail';
import { Documents } from './pages/Documents';
import { Tasks } from './pages/Tasks';
import { Backlog } from './pages/Backlog';
import { PublicBuildingPlan } from './pages/PublicBuildingPlan';
import { NotFound } from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      {/* Без AppLayout — ссылка отправляется клиенту напрямую, без бокового меню CRM.
          Путь намеренно не содержит id объекта (см. RealtyObject.shareToken) — иначе
          достаточно было бы отредактировать URL, чтобы попасть на /objects/:id. */}
      <Route path="/plan/:token" element={<PublicBuildingPlan />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/objects" element={<Objects />} />
        <Route path="/objects/:id" element={<ObjectDetail />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/backlog" element={<Backlog />} />
      </Route>
      {/* Любой нераспознанный путь (в т.ч. испорченная публичная ссылка) не должен
          проваливаться в CRM — раньше он попадал на Home внутри AppLayout. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
