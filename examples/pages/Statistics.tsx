import { useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { PageHeader } from '../../src/components/layout/PageHeader';
import { InfoBanner } from '../../src/components/layout/InfoBanner';
import { TreeTable } from '../../src/components/ui/TreeTable';
import { Select } from '../../src/components/ui/Select';
import { cn } from '../../src/lib/cn';
import { statisticsColumns, statisticsRows, statisticsTotal } from '../data/statistics';

const viewModes = ['Стандартная', 'Древовидная'] as const;

export function Statistics() {
  const [view, setView] = useState<(typeof viewModes)[number]>('Древовидная');

  return (
    <>
      <PageHeader title="Статистика" notifications={2} />
      <InfoBanner>
        До 30 января открыт приём заявок по БЦ «Меркурий» — комиссия партнёру увеличена до 750 000 ₽
      </InfoBanner>

      <div className="flex w-fit gap-1 rounded-full border border-border bg-surface p-1">
        {viewModes.map((mode) => (
          <button
            key={mode}
            onClick={() => setView(mode)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              view === mode ? 'border border-primary text-primary' : 'text-ink-muted',
            )}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm text-ink-muted">
            <CalendarDays className="h-4 w-4" />
            Даты
          </span>
          <Select placeholder="Тип объекта" options={['Бизнес-центры', 'Торговые центры', 'Склады', 'Спортивные объекты']} pill />
          <Select placeholder="Объект" options={statisticsRows.flatMap((r) => r.children?.map((c) => c.label) ?? [])} pill />
          <Select placeholder="Площадки" options={['Все площадки']} pill />
        </div>
        <button className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink-muted hover:border-primary hover:text-primary">
          <X className="h-4 w-4" />
          Удалить
        </button>
      </div>

      <TreeTable columns={statisticsColumns} rows={statisticsRows} totalRow={statisticsTotal} />
    </>
  );
}
