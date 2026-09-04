import { Clock, ExternalLink, Globe } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';

// Пока просто информационный список действующих продающих страниц — без
// редактирования (владелец: "без правок, пока только инфа"). Список
// намеренно статический, не из Supabase objects: это не сущность "объект",
// а курируемый список публичных лендингов, среди которых уже есть не
// только объекты (гид по району — обычная контентная страница).
//
// url опционален — запись без него (см. "Бизнес-апартаменты" ниже) это
// ещё не существующая страница, только заявка в план ("заготовка статьи",
// владелец 2026-08-25): не на что ссылаться, карточка не кликается, вместо
// внешней ссылки — статус. status — открытый список в том же духе, что и
// остальные "растущие" поля проекта (не жёсткий enum), пока единственное
// значение — 'needs-work' ("Требует проработки", жёлтый бейдж).
interface LandingEntry {
  title: string;
  description: string;
  url?: string;
  status?: 'needs-work';
}

const LANDING_STATUS_LABEL: Record<NonNullable<LandingEntry['status']>, string> = {
  'needs-work': 'Требует проработки',
};

const LANDINGS: LandingEntry[] = [
  {
    title: 'Хаб «Минск»',
    description: 'Гиды по районам — общий раздел /minsk.',
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
    title: 'Статья: Бизнес-апартаменты',
    description:
      'Разбор нового для района формата коммерческой недвижимости — чем отличается от офиса и жилых апартаментов, как оформляется, кому подходит. Возможно, будет отдельным лендингом. Нужна фактура от Татьяны Гаврис (налоговый консультант).',
    status: 'needs-work',
  },
  {
    title: 'Бизнес-центры Минска',
    description: 'Справочник бизнес-центров города: адреса, класс, площадь, год постройки — по данным веб-ресерча, фото добавляет владелец.',
    url: 'https://redevelopment.pro/minsk/bcminsk',
  },
];

export function Landings() {
  return (
    <>
      <PageHeader title="Лендинги" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {LANDINGS.map((l) => {
          const content = (
            <>
              <div className="flex items-center justify-between gap-2">
                {l.url ? (
                  <div className="flex min-w-0 items-center gap-2 text-ink-muted">
                    <Globe className="h-4 w-4 shrink-0" />
                    <span className="truncate text-xs">{l.url.replace('https://', '')}</span>
                  </div>
                ) : (
                  <span className="text-xs text-ink-faint">Страницы ещё нет</span>
                )}
                {l.status && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full border border-warning/30 bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">
                    <Clock className="h-3 w-3 shrink-0" />
                    {LANDING_STATUS_LABEL[l.status]}
                  </span>
                )}
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-ink">{l.title}</span>
                {l.url && <ExternalLink className="h-4 w-4 shrink-0 text-ink-faint" />}
              </div>
              <p className="text-sm text-ink-muted">{l.description}</p>
            </>
          );

          return l.url ? (
            <a
              key={l.title}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('flex flex-col gap-3 p-4 transition-colors hover:border-primary/40', glassCardClass)}
              style={glassCardShadow}
            >
              {content}
            </a>
          ) : (
            <div key={l.title} className={cn('flex flex-col gap-3 p-4', glassCardClass)} style={glassCardShadow}>
              {content}
            </div>
          );
        })}
      </div>
    </>
  );
}
