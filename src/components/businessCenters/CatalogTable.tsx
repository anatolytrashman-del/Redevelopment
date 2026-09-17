import { Link } from 'react-router-dom';
import { ArrowDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { BusinessCenter } from '../../data/businessCenters';
import { shortName, streetOfAddress } from '../../lib/businessCenterDisplay';
import {
  nearestMetroMeters,
  type CatalogOfferIndex,
  type CatalogSortKey,
} from '../../lib/businessCenterCatalogFilter';

// Вид «таблица» (К6 плана docs/bc-catalog-redesign-plan.md) — главный ответ
// на «хочется накликать нужный результат за один экран»: все отобранные БЦ
// одним компактным списком, где строки реально сравнимы между собой.
// Плитки хороши, когда смотришь на 5–10 зданий; когда их 143 и нужно
// «самый дешёвый класс B у метро», нужна таблица.
//
// Здесь НЕТ пагинации, в отличие от плиток: строка таблицы — это текст без
// «стекла», фонового размытия и фотографии, 143 штуки браузер рисует не
// задумываясь (ровно поэтому плитки и приходилось ограничивать).
//
// Пустая ячейка — честное «нет данных», а не ноль и не прочерк-заглушка со
// смыслом «плохо»: у части зданий параметра нет в источнике.

interface Column {
  key: string;
  label: string;
  // Сортировка колонки — та же, что в общей панели фильтра: клик по
  // заголовку просто переключает её, чтобы «таблица» и «плитки» никогда не
  // расходились в порядке.
  sort?: CatalogSortKey;
  align?: 'right';
  render: (c: BusinessCenter, offers: CatalogOfferIndex) => React.ReactNode;
}

const DASH = <span className="text-ink-faint">—</span>;

const COLUMNS: Column[] = [
  {
    key: 'name',
    label: 'Бизнес-центр',
    sort: 'name',
    render: (c) => (
      <span className="flex flex-col">
        <span className="font-semibold text-ink">{shortName(c)}</span>
        <span className="text-xs text-ink-faint">{streetOfAddress(c.address)}</span>
      </span>
    ),
  },
  { key: 'class', label: 'Класс', render: (c) => c.businessClass ?? DASH },
  { key: 'district', label: 'Район', render: (c) => (c.district ? c.district.replace(' район', '') : DASH) },
  {
    key: 'metro',
    label: 'Метро',
    sort: 'metro',
    align: 'right',
    render: (c) => {
      const m = nearestMetroMeters(c);
      return m == null ? DASH : `${m.toLocaleString('ru-RU')} м по прямой`;
    },
  },
  {
    key: 'area',
    label: 'Площадь',
    sort: 'area',
    align: 'right',
    render: (c) => (c.totalArea == null ? DASH : `${c.totalArea.toLocaleString('ru-RU')} м²`),
  },
  {
    key: 'floor',
    label: 'Этаж',
    sort: 'floor-plate',
    align: 'right',
    render: (c) => (c.floorPlateArea == null ? DASH : `${c.floorPlateArea.toLocaleString('ru-RU')} м²`),
  },
  {
    key: 'management',
    label: 'УК/ТС',
    render: (c) => (c.managementType == null ? DASH : c.managementType === 'single_uk' ? 'УК' : 'ТС'),
  },
  {
    key: 'parking',
    label: 'Парковка',
    align: 'right',
    render: (c) => (c.parkingRatio == null ? DASH : c.parkingRatio.toLocaleString('ru-RU')),
  },
  {
    key: 'rent',
    label: 'Аренда',
    sort: 'rent',
    align: 'right',
    render: (c, o) => {
      const r = o.rentBySlug.get(c.slug);
      return r?.median == null ? DASH : `$${r.median}/м²`;
    },
  },
  {
    key: 'lots',
    label: 'Лотов',
    sort: 'offers',
    align: 'right',
    render: (c, o) => {
      const n = (o.rentBySlug.get(c.slug)?.n ?? 0) + (o.saleBySlug.get(c.slug)?.n ?? 0);
      return n === 0 ? DASH : n;
    },
  },
  {
    key: 'rating',
    label: '2ГИС',
    sort: 'rating',
    align: 'right',
    render: (c) => (c.gisRating == null ? DASH : c.gisRating),
  },
];

export function CatalogTable({
  centers,
  offers,
  sort,
  onSort,
}: {
  centers: BusinessCenter[];
  offers: CatalogOfferIndex;
  sort: CatalogSortKey;
  onSort: (key: CatalogSortKey) => void;
}) {
  return (
    <div className={cn('overflow-x-auto p-2 sm:p-3', glassCardClass)} style={glassCardShadow}>
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-2 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted',
                  col.align === 'right' && 'text-right',
                )}
              >
                {col.sort ? (
                  <button
                    type="button"
                    onClick={() => onSort(col.sort as CatalogSortKey)}
                    className={cn(
                      'inline-flex items-center gap-1 transition-colors hover:text-ink',
                      sort === col.sort && 'text-primary-hover',
                    )}
                  >
                    {col.label}
                    {sort === col.sort && <ArrowDown className="h-3 w-3 shrink-0" />}
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {centers.map((c) => (
            <tr key={c.slug} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
              {COLUMNS.map((col, i) => (
                <td
                  key={col.key}
                  className={cn('whitespace-nowrap px-2 py-2 text-ink-muted', col.align === 'right' && 'text-right')}
                >
                  {/* Кликабельна вся строка по смыслу, но ссылка одна — на
                      названии: строка-ссылка в таблице ломает выделение
                      текста и копирование чисел, ради которых таблицу и
                      открывают. */}
                  {i === 0 ? (
                    <Link to={`/minsk/bcminsk/${c.slug}`} className="hover:text-primary-hover">
                      {col.render(c, offers)}
                    </Link>
                  ) : (
                    col.render(c, offers)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
