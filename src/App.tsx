import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Home } from './pages/Home';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
