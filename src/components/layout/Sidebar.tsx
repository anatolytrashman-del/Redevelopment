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
  HardHat,
  ClipboardList,
  Calculator,
  MessageSquareText,
  X,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { fetchBacklogUnreadCount } from '../../lib/backlogApi';
import { getBacklogLastViewedAt, onBacklogViewed } from '../../lib/backlogSeen';
import { fetchLeadsUnreadCount } from '../../lib/leadsApi';
import { getLeadsLastViewedAt, onLeadsViewed } from '../../lib/leadsSeen';
import { fetchContractorsWithBirthdayToday } from '../../lib/contractorsApi';

// Полная навигация проекта — держим здесь как референс с готовыми иконками.
// В меню показываем только готовые страницы (см. visibleLabels ниже) —
// остальные пункты добавляйте в этот список по мере готовности страниц.
const allNavItems = [
  { to: '/admin/dashboard', label: 'Дашборд', icon: LayoutGrid },
  { to: '/admin/tasks', label: 'Задачи', icon: ListChecks },
  { to: '/admin/transactions', label: 'Транзакции', icon: Receipt },
  { to: '/admin/leads', label: 'Лиды', icon: Users },
  { to: '/admin/contractors', label: 'Подрядчики', icon: HardHat },
  { to: '/admin/objects', label: 'Объекты', icon: Building2 },
  { to: '/admin/tz', label: 'Техзадания', icon: ClipboardList },
  { to: '/admin/estimates', label: 'Сметы', icon: Calculator },
  { to: '/admin/documents', label: 'Документы', icon: FileStack },
  { to: '/admin/meeting-summaries', label: 'Саммери встреч', icon: MessageSquareText },
  { to: '/admin/statistics', label: 'Статистика', icon: PieChart },
  { to: '/admin/payouts', label: 'Выплаты', icon: Wallet },
  { to: '/admin/account', label: 'Аккаунт', icon: User },
  { to: '/admin/support', label: 'Поддержка', icon: MessageCircle },
  { to: '/admin/faq', label: 'FAQ', icon: HelpCircle },
  { to: '/admin/invite', label: 'Пригласить партнёра', icon: UserPlus },
];

// Порядок пунктов в этом списке — это порядок пунктов в меню.
const visibleLabels = ['Задачи', 'Объекты', 'Техзадания', 'Сметы', 'Лиды', 'Подрядчики', 'Транзакции', 'Документы', 'Саммери встреч'];
const navItems = visibleLabels.map((label) => allNavItems.find((item) => item.label === label)!);

// Ниже lg — сайдбар выезжает поверх контента как шторка (fixed + translate),
// а не занимает четверть узкого экрана постоянно. От lg и шире — прежнее
// поведение (sticky-колонка слева, всегда видима, open/onClose не влияют).
interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const [backlogUnread, setBacklogUnread] = useState(0);
  const [leadsUnread, setLeadsUnread] = useState(0);
  const [birthdayNames, setBirthdayNames] = useState<string[]>([]);

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

  // Без отметки "просмотрено" — в отличие от бэклога/лидов, тут не список,
  // который можно прочитать и закрыть, а факт "сегодня чей-то день рождения",
  // актуальный весь день независимо от того, заходили ли уже в "Подрядчики".
  useEffect(() => {
    function refresh() {
      fetchContractorsWithBirthdayToday()
        .then((list) => setBirthdayNames(list.map((c) => c.name)))
        .catch(() => {});
    }
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  return (
    <>
      {/* Подложка-затемнение позади шторки — только когда она открыта и
          только ниже lg (на десктопе сайдбар постоянно виден, подложка не нужна). */}
      {open && <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-svh w-72 max-w-[85vw] shrink-0 flex-col overflow-y-auto border-r border-white/50 bg-white/70 px-5 py-6 backdrop-blur-xl backdrop-saturate-150 transition-transform duration-200 ease-out',
          'lg:sticky lg:top-0 lg:z-0 lg:w-64 lg:max-w-none lg:translate-x-0 lg:bg-white/30',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex flex-col gap-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-extrabold tracking-wide text-ink">
                <span className="font-black text-primary">RED</span>EVELOPMENT
              </span>
              <span className="text-xs font-medium text-ink-faint">Админка</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть меню"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:text-ink lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'text-primary' : 'text-ink hover:text-primary',
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {label}
                {label === 'Подрядчики' && birthdayNames.length > 0 && (
                  <span
                    className="ml-auto shrink-0 text-base leading-none"
                    role="img"
                    aria-label={`Сегодня день рождения: ${birthdayNames.join(', ')}`}
                    title={`Сегодня день рождения: ${birthdayNames.join(', ')}`}
                  >
                    🎂
                  </span>
                )}
                {label === 'Лиды' && leadsUnread > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                    {leadsUnread}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-auto flex flex-col gap-1 border-t border-white/50 pt-4">
          <NavLink
            to="/admin/backlog"
            onClick={onClose}
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
    </>
  );
}
