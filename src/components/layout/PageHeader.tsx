import type { ReactNode } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassPillClass, glassPillShadow } from '../../lib/glass';

interface PageHeaderProps {
  title: string;
  notifications?: number;
  action?: ReactNode;
}

export function PageHeader({ title, notifications, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-3xl font-extrabold text-ink">{title}</h1>
      <div className="flex items-center gap-3">
        {action}
        <button
          className={cn('relative flex h-11 w-11 items-center justify-center text-ink', glassPillClass)}
          style={glassPillShadow}
        >
          <Bell className="h-5 w-5" />
          {!!notifications && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-white">
              {notifications}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
