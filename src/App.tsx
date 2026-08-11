import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { Objects } from './pages/Objects';
import { ObjectDetail } from './pages/ObjectDetail';
import { Statistics } from './pages/Statistics';
import { Placeholder } from './pages/Placeholder';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/objects" element={<Objects />} />
        <Route path="/objects/:id" element={<ObjectDetail />} />
        <Route path="/statistics" element={<Statistics />} />
        <Route
          path="/payouts"
          element={
            <Placeholder
              title="Выплаты"
              description="История выплат комиссий партнёрам появится здесь после подключения биллинга."
            />
          }
        />
        <Route
          path="/account"
          element={<Placeholder title="Аккаунт" description="Настройки профиля, реквизиты и договоры партнёра." />}
        />
        <Route
          path="/support"
          element={<Placeholder title="Поддержка" description="Чат с менеджером Lobsters по вопросам сделок." />}
        />
        <Route path="/faq" element={<Placeholder title="FAQ" description="Ответы на частые вопросы о работе с объектами." />} />
        <Route
          path="/invite"
          element={<Placeholder title="Пригласить партнёра" description="Реферальная программа для брокеров и агентов." />}
        />
      </Route>
    </Routes>
  );
}
