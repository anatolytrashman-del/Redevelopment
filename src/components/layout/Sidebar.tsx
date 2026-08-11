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
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { LobsterMark } from '../ui/LobsterMark';
import { LobstersLogo } from '../ui/LobstersLogo';

const navItems = [
  { to: '/', label: 'Дашборд', icon: LayoutGrid, end: true },
  { to: '/objects', label: 'Объекты', icon: Building2 },
  { to: '/statistics', label: 'Статистика', icon: PieChart },
  { to: '/payouts', label: 'Выплаты', icon: Wallet },
  { to: '/account', label: 'Аккаунт', icon: User },
  { to: '/support', label: 'Поддержка', icon: MessageCircle },
  { to: '/faq', label: 'FAQ', icon: HelpCircle },
];

export function Sidebar() {
  return (
    <aside className="flex h-svh w-64 shrink-0 flex-col justify-between overflow-hidden border-r border-border bg-bg px-5 py-6">
      <div className="flex flex-col gap-8">
        <LobstersLogo className="w-40" />
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
          <NavLink
            to="/invite"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'text-primary' : 'text-ink hover:text-primary',
              )
            }
          >
            <UserPlus className="h-5 w-5" />
            Пригласить партнёра
          </NavLink>
        </nav>
      </div>
      <LobsterMark className="w-24 opacity-90" />
    </aside>
  );
}
