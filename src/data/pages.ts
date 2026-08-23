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
  TrendingUp,
  Landmark,
  Palette,
  Globe,
  ClipboardCheck,
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
  | 'landings'
  | 'marketOffers'
  | 'contractors'
  | 'objects'
  | 'tz'
  | 'estimates'
  | 'finModels'
  | 'financing'
  | 'designProjects'
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
  { key: 'finModels', to: '/admin/finmodels', label: 'Финмодели', icon: TrendingUp },
  { key: 'financing', to: '/admin/financing', label: 'Финансирование', icon: Landmark },
  { key: 'designProjects', to: '/admin/design-projects', label: 'Дизайн-проекты', icon: Palette },
  { key: 'leads', to: '/admin/leads', label: 'Лиды', icon: Users },
  { key: 'landings', to: '/admin/landings', label: 'Лендинги', icon: Globe },
  { key: 'marketOffers', to: '/admin/market-offers', label: 'Рынок недвижимости', icon: ClipboardCheck },
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
  'contractors',
  'tz',
  'estimates',
  'finModels',
  'financing',
  'designProjects',
  'landings',
  'marketOffers',
  'leads',
  'transactions',
  'documents',
  'meetingSummaries',
  'settings',
];

// Раскладка сайдбара поверх VISIBLE_PAGE_KEYS: обычно пункт меню = страница,
// но некоторые пункты хочется сгруппировать под общим подзаголовком (см.
// Sidebar.tsx) — например "Маркетинг" объединяет "Лендинги" и "Лиды", когда
// пунктов в этой теме набирается больше одного. Остальные пункты остаются
// плоским списком, как раньше.
export type SidebarEntry = { type: 'page'; key: PageKey } | { type: 'group'; label: string; keys: PageKey[] };

export const SIDEBAR_LAYOUT: SidebarEntry[] = [
  { type: 'page', key: 'tasks' },
  { type: 'page', key: 'objects' },
  { type: 'page', key: 'contractors' },
  { type: 'group', label: 'Стройка', keys: ['tz', 'estimates', 'designProjects'] },
  { type: 'group', label: 'Финансы', keys: ['finModels', 'financing', 'transactions', 'documents'] },
  { type: 'group', label: 'Маркетинг', keys: ['landings', 'marketOffers', 'leads'] },
  { type: 'page', key: 'meetingSummaries' },
  { type: 'page', key: 'settings' },
];

export function findPage(key: PageKey): AdminPage {
  const page = ADMIN_PAGES.find((p) => p.key === key);
  if (!page) throw new Error(`Unknown page key: ${key}`);
  return page;
}
