import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="flex min-h-svh bg-bg">
      <Sidebar />
      <main className="flex-1 px-10 py-8">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
