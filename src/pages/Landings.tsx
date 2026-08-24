import { ExternalLink, Globe } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';

// Пока просто информационный список действующих продающих страниц — без
// редактирования (владелец: "без правок, пока только инфа"). Список
// намеренно статический, не из Supabase objects: это не сущность "объект",
// а курируемый список публичных лендингов, среди которых уже есть не
// только объекты (гид по району — обычная контентная страница).
interface LandingEntry {
  title: string;
  description: string;
  url: string;
}

const LANDINGS: LandingEntry[] = [
  {
    title: 'Хаб «Минск»',
    description: 'Комплексы компании, гиды по районам и аналитика рынка — общий раздел /minsk.',
    url: 'https://redevelopment.pro/minsk',
  },
  {
    title: 'Лендинг комплекса Red One',
    description: 'Продающая страница делового комплекса Red One — планировки, бронирование кабинетов и рабочих мест.',
    url: 'https://redevelopment.pro/minsk/one',
  },
  {
    title: 'Страница про Минск-Мир',
    description: 'Гид и аналитика по офисам и коммерческим помещениям в районе Минск Мир — контентная SEO-страница.',
    url: 'https://redevelopment.pro/minsk/minsk-mir',
  },
  {
    title: 'Аналитика рынка: Минск Мир',
    description: 'Цены и предложения по продаже и аренде коммерческих помещений — сводная таблица по району.',
    url: 'https://redevelopment.pro/minsk/analytics/minsk-mir',
  },
];

export function Landings() {
  return (
    <>
      <PageHeader title="Лендинги" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {LANDINGS.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('flex flex-col gap-3 p-4 transition-colors hover:border-primary/40', glassCardClass)}
            style={glassCardShadow}
          >
            <div className="flex items-center gap-2 text-ink-muted">
              <Globe className="h-4 w-4" />
              <span className="truncate text-xs">{l.url.replace('https://', '')}</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-ink">{l.title}</span>
              <ExternalLink className="h-4 w-4 shrink-0 text-ink-faint" />
            </div>
            <p className="text-sm text-ink-muted">{l.description}</p>
          </a>
        ))}
      </div>
    </>
  );
}
