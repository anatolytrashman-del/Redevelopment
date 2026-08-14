import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  Building2,
  PieChart,
  Wallet,
  User,
  MessageCircle,
  HelpCircle,
  UserPlus,
  Receipt,
  Users,
  FileStack,
  ListChecks,
  Lightbulb,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { fetchBacklogUnreadCount } from '../../lib/backlogApi';
import { getBacklogLastViewedAt, onBacklogViewed } from '../../lib/backlogSeen';
import { fetchLeadsUnreadCount } from '../../lib/leadsApi';
import { getLeadsLastViewedAt, onLeadsViewed } from '../../lib/leadsSeen';

// Полная навигация проекта — держим здесь как референс с готовыми иконками.
// В меню показываем только готовые страницы (см. visibleLabels ниже) —
// остальные пункты добавляйте в этот список по мере готовности страниц.
const allNavItems = [
  { to: '/admin/dashboard', label: 'Дашборд', icon: LayoutGrid },
  { to: '/admin/tasks', label: 'Задачи', icon: ListChecks },
  { to: '/admin/transactions', label: 'Транзакции', icon: Receipt },
  { to: '/admin/leads', label: 'Лиды', icon: Users },
  { to: '/admin/objects', label: 'Объекты', icon: Building2 },
  { to: '/admin/documents', label: 'Документы', icon: FileStack },
  { to: '/admin/statistics', label: 'Статистика', icon: PieChart },
  { to: '/admin/payouts', label: 'Выплаты', icon: Wallet },
  { to: '/admin/account', label: 'Аккаунт', icon: User },
  { to: '/admin/support', label: 'Поддержка', icon: MessageCircle },
  { to: '/admin/faq', label: 'FAQ', icon: HelpCircle },
  { to: '/admin/invite', label: 'Пригласить партнёра', icon: UserPlus },
];

// Порядок пунктов в этом списке — это порядок пунктов в меню.
const visibleLabels = ['Задачи', 'Объекты', 'Лиды', 'Транзакции', 'Документы'];
const navItems = visibleLabels.map((label) => allNavItems.find((item) => item.label === label)!);

export function Sidebar() {
  const [backlogUnread, setBacklogUnread] = useState(0);
  const [leadsUnread, setLeadsUnread] = useState(0);

  useEffect(() => {
    function refresh() {
      fetchBacklogUnreadCount(getBacklogLastViewedAt())
        .then(setBacklogUnread)
        .catch(() => {});
    }
    refresh();
    window.addEventListener('focus', refresh);
    const unsubscribe = onBacklogViewed(refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    function refresh() {
      fetchLeadsUnreadCount(getLeadsLastViewedAt())
        .then(setLeadsUnread)
        .catch(() => {});
    }
    refresh();
    window.addEventListener('focus', refresh);
    const unsubscribe = onLeadsViewed(refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      unsubscribe();
    };
  }, []);

  return (
    <aside className="sticky top-0 flex h-svh w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-bg px-5 py-6">
      <div className="flex flex-col gap-8">
        <span className="text-lg font-extrabold tracking-wide text-ink">
          <span className="font-black text-primary">RED</span>EVELOPMENT
        </span>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-ink hover:text-primary',
                )
              }
            >
              <Icon className="h-5 w-5" />
              {label}
              {label === 'Лиды' && leadsUnread > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                  {leadsUnread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
        <NavLink
          to="/admin/backlog"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'text-primary' : 'text-ink hover:text-primary',
            )
          }
        >
          <Lightbulb className="h-5 w-5" />
          Предложить идею
          {backlogUnread > 0 && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
              {backlogUnread}
            </span>
          )}
        </NavLink>
      </div>
    </aside>
  );
}
