import type { ReactNode } from 'react';

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-control bg-info-bg px-5 py-4 text-sm font-medium text-info-text">
      {children}
    </div>
  );
}
