import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { shortName } from '../../lib/businessCenterDisplay';
import {
  alphabeticalCenters,
  classSlices,
  districtSlices,
  metroSlices,
  microdistrictSlices,
  statusSlices,
  streetSlices,
  type CatalogSlice,
} from '../../lib/catalogSlices';
import { type BusinessCenter } from '../../data/businessCenters';

// Срезы каталога: чипы SEO-хабов (класс, район, микрорайон, метро, улица,
// стройка) плюс алфавитный перечень ВСЕХ зданий. До 2026-09-22 блок жил под
// результатами каталога, включая его главную; владелец попросил расчистить
// главную, и блок уехал на страницу-гид /minsk/bcminsk/gid — но остался на
// хабах, поэтому вёрстка и подсчёты вынесены сюда: две копии этой логики
// разошлись бы, а цена расхождения — полсотни хаб-страниц без внутренних
// ссылок и часть каталога, до которой краулеру не дойти (карточек в сетке
// рендерится 48, «Показать ещё» — клиентская кнопка, в пререндер не
// попадает).
//
// Сам подсчёт осей с 2026-09-22 живёт в lib/catalogSlices.ts — те же списки
// нужны верхнему меню (CatalogTopNav), и считать их дважды нельзя.

export function CatalogSlicesBlock({ centers }: { centers: BusinessCenter[] }) {
  const allCentersAlphabetical = useMemo(() => alphabeticalCenters(centers), [centers]);

  const groups = useMemo<{ label: string; items: CatalogSlice[]; withCounts: boolean }[]>(
    () => [
      { label: 'По классу', items: classSlices(centers), withCounts: false },
      { label: 'По району', items: districtSlices(centers), withCounts: false },
      { label: 'По микрорайону', items: microdistrictSlices(centers), withCounts: true },
      { label: 'У метро', items: metroSlices(centers), withCounts: true },
      { label: 'По улице', items: streetSlices(centers), withCounts: true },
      // Без пункта «Весь каталог» — на странице-гиде он уже есть в хлебных
      // крошках и в заголовке, второй ссылкой был бы шум. В меню он нужен,
      // поэтому живёт в общей statusSlices и отсекается здесь.
      { label: 'Статус', items: statusSlices(centers).filter((s) => s.key !== 'all'), withCounts: false },
    ],
    [centers],
  );

  if (centers.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-5 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="text-lg font-bold text-ink">Срезы каталога</h2>
      {groups.map((group) => {
        if (group.items.length === 0) return null;
        return (
          <div key={group.label} className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{group.label}</span>
            <div className="flex flex-wrap gap-2">
              {group.items.map((i) => (
                <Link
                  key={i.key}
                  to={i.url}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary-hover"
                >
                  {group.withCounts ? `${i.label} (${i.count})` : i.label}
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {/* Все названия ссылками. Обычный текст, без «стекла» и фото: 143
          ссылки здесь ничего не стоят браузеру, а без них страница
          ссылалась бы только на треть каталога. */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Все бизнес-центры каталога
        </span>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {allCentersAlphabetical.map((c) => (
            <Link
              key={c.slug}
              to={`/minsk/bcminsk/${c.slug}`}
              className="text-sm text-ink-muted transition-colors hover:text-primary-hover"
            >
              {/* Второе название здания — прямо в алфавитном перечне:
                  человек, который знает БЦ «V» только как «Столица», иначе
                  не найдёт его в списке из 143 имён. */}
              {shortName(c)}
              {c.altNames.length > 0 && ` (${c.altNames.join(', ')})`}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
