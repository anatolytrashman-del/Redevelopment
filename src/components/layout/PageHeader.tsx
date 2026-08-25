import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow, glassPillClass, glassPillShadow } from '../../lib/glass';
import { markAllNotificationsRead, useNotifications } from '../../lib/notifications';

interface PageHeaderProps {
  title: string;
  action?: ReactNode;
}

function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  return `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
}

export function PageHeader({ title, action }: PageHeaderProps) {
  const notifications = useNotifications();
  const unreadCount = notifications.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      // Открыли — считаем всё прочитанным (то же поведение, что у любого
      // обычного колокольчика: бейдж гаснет по факту открытия списка, не
      // нужна отдельная кнопка "отметить прочитанным" ради одного счётчика).
      if (next) markAllNotificationsRead();
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="min-w-0 break-words text-2xl font-extrabold text-ink sm:text-3xl">{title}</h1>
      <div className="flex shrink-0 items-center gap-3">
        {action}
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={toggle}
            aria-label="Уведомления"
            className={cn('relative flex h-11 w-11 items-center justify-center text-ink', glassPillClass)}
            style={glassPillShadow}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div
              className={cn('absolute right-0 top-full z-40 mt-2 max-h-96 w-80 overflow-y-auto p-2', glassCardClass)}
              style={glassCardShadow}
            >
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-ink-faint">
                  <BellOff className="h-5 w-5" />
                  Уведомлений пока нет
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {notifications.map((n) => (
                    <div key={n.id} className="rounded-control px-3 py-2.5 hover:bg-white/50">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-semibold text-ink">{n.title}</span>
                        <span className="shrink-0 whitespace-nowrap text-xs text-ink-faint">{formatNotificationTime(n.createdAt)}</span>
                      </div>
                      {n.body && <div className="mt-0.5 text-sm text-ink-muted">{n.body}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
