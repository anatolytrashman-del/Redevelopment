import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Home } from './pages/Home';
import { Transactions } from './pages/Transactions';
import { Leads } from './pages/Leads';
import { Objects } from './pages/Objects';
import { ObjectDetail } from './pages/ObjectDetail';
import { DocumentTemplates } from './pages/DocumentTemplates';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/objects" element={<Objects />} />
        <Route path="/objects/:id" element={<ObjectDetail />} />
        <Route path="/document-templates" element={<DocumentTemplates />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
