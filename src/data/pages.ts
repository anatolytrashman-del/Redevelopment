import type { LucideIcon } from 'lucide-react';
import {
  LayoutGrid,
  Building2,
  Receipt,
  Users,
  HardHat,
  ClipboardList,
  Calculator,
  FileStack,
  MessageSquareText,
  Settings,
  ListChecks,
} from 'lucide-react';

// Единый список страниц админки — здесь и маршрут, и ключ доступа (см.
// data/accessProfiles.ts), и то, что рисуется в сайдбаре. Раньше эти же
// данные жили только в Sidebar.tsx как список для меню; вынесено сюда,
// когда понадобилось использовать тот же список ещё и для проверки
// доступа на уровне маршрутов (RequirePage) — держать один источник
// правды проще, чем синхронизировать два похожих списка вручную.
export type PageKey =
  | 'dashboard'
  | 'tasks'
  | 'transactions'
  | 'leads'
  | 'contractors'
  | 'objects'
  | 'tz'
  | 'estimates'
  | 'documents'
  | 'meetingSummaries'
  | 'settings'
  | 'backlog';

export interface AdminPage {
  key: PageKey;
  to: string;
  label: string;
  icon: LucideIcon;
}

// Все существующие страницы админки (включая скрытые из меню — Дашборд,
// Предложить идею/Бэклог — им всё равно нужен ключ доступа на случай
// прямого перехода по ссылке).
export const ADMIN_PAGES: AdminPage[] = [
  { key: 'dashboard', to: '/admin/dashboard', label: 'Дашборд', icon: LayoutGrid },
  { key: 'tasks', to: '/admin/tasks', label: 'Задачи', icon: ListChecks },
  { key: 'objects', to: '/admin/objects', label: 'Объекты', icon: Building2 },
  { key: 'tz', to: '/admin/tz', label: 'Техзадания', icon: ClipboardList },
  { key: 'estimates', to: '/admin/estimates', label: 'Сметы', icon: Calculator },
  { key: 'leads', to: '/admin/leads', label: 'Лиды', icon: Users },
  { key: 'contractors', to: '/admin/contractors', label: 'Подрядчики', icon: HardHat },
  { key: 'transactions', to: '/admin/transactions', label: 'Транзакции', icon: Receipt },
  { key: 'documents', to: '/admin/documents', label: 'Документы', icon: FileStack },
  { key: 'meetingSummaries', to: '/admin/meeting-summaries', label: 'Саммери встреч', icon: MessageSquareText },
  { key: 'settings', to: '/admin/settings', label: 'Настройки', icon: Settings },
  { key: 'backlog', to: '/admin/backlog', label: 'Предложить идею', icon: ListChecks },
];

// Порядок и состав пунктов в основном меню сайдбара (без "Предложить
// идею" — у него свой пункт снизу, как и раньше).
export const VISIBLE_PAGE_KEYS: PageKey[] = [
  'tasks',
  'objects',
  'tz',
  'estimates',
  'leads',
  'contractors',
  'transactions',
  'documents',
  'meetingSummaries',
  'settings',
];

export function findPage(key: PageKey): AdminPage {
  const page = ADMIN_PAGES.find((p) => p.key === key);
  if (!page) throw new Error(`Unknown page key: ${key}`);
  return page;
}
