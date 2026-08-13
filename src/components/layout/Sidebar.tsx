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
} from 'lucide-react';
import { cn } from '../../lib/cn';

// Полная навигация проекта — держим здесь как референс с готовыми иконками.
// В меню показываем только готовые страницы (см. visibleLabels ниже) —
// остальные пункты добавляйте в этот список по мере готовности страниц.
const allNavItems = [
  { to: '/', label: 'Дашборд', icon: LayoutGrid, end: true },
  { to: '/transactions', label: 'Транзакции', icon: Receipt },
  { to: '/leads', label: 'Лиды', icon: Users },
  { to: '/objects', label: 'Объекты', icon: Building2 },
  { to: '/statistics', label: 'Статистика', icon: PieChart },
  { to: '/payouts', label: 'Выплаты', icon: Wallet },
  { to: '/account', label: 'Аккаунт', icon: User },
  { to: '/support', label: 'Поддержка', icon: MessageCircle },
  { to: '/faq', label: 'FAQ', icon: HelpCircle },
  { to: '/invite', label: 'Пригласить партнёра', icon: UserPlus },
];

// Порядок пунктов в этом списке — это порядок пунктов в меню.
const visibleLabels = ['Объекты', 'Лиды', 'Транзакции'];
const navItems = visibleLabels.map((label) => allNavItems.find((item) => item.label === label)!);

export function Sidebar() {
  return (
    <aside className="flex h-svh w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-bg px-5 py-6">
      <div className="flex flex-col gap-8">
        <span className="text-lg font-extrabold tracking-wide text-ink">
          <span className="text-primary">RED</span>EVELOPMENT
        </span>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-ink hover:text-primary',
                )
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
