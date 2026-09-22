import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  classSlices,
  districtSlices,
  metroSlicesByLine,
  statusSlices,
  type CatalogSlice,
  type MetroLineGroup,
} from '../../lib/catalogSlices';
import type { BusinessCenter } from '../../data/businessCenters';

// Сквозная верхняя шапка каталога БЦ (владелец, 2026-09-22: «делаем верхнее
// меню, пусть оно будет сквозным для каталога БЦ»). До неё каждая из пяти
// страниц каталога рисовала свою шапку копипастой: где-то sticky, где-то
// нет, и набор ссылок в каждой свой — с карточки здания нельзя было попасть
// никуда, кроме списка. Здесь один компонент на все страницы.
//
// ВАЖНО про «остальной сайт»: владелец там же — «по остальному сайту ещё
// продумаем». Шапка сознательно НЕ ставится на /minsk, /minsk/minsk-mir,
// /minsk/analytics/* и продающие лендинги: у них своя навигация и свои
// разделы, и общее меню для них ещё не решено.

// Метро — особый случай: не плоский список, а группы по ветке со своим
// цветным кружком (владелец, 2026-09-22: «расположи по веткам с цветным
// кружочком... в той последовательности, как на схеме метро»), остальные
// три оси — обычные плоские списки. Отсюда размеченное объединение вместо
// одной формы MenuGroup на все случаи.
type MenuGroup =
  | { kind: 'flat'; label: string; items: CatalogSlice[] }
  | { kind: 'metro'; label: string; lines: MetroLineGroup[] };

export type CatalogTopNavProps = {
  /**
   * Каталог для построения вложенного меню. `null` — данные ещё грузятся:
   * шапка рисуется сразу, вложенные списки появляются вместе с данными
   * (все пять страниц каталога и так зовут fetchBusinessCenters для своего
   * содержимого, отдельного запроса меню не делает).
   */
  centers: BusinessCenter[] | null;
  /** Ширина внутреннего контейнера — та же, что у контента страницы. */
  width?: string;
  /** Второй ряд внутри той же sticky-шапки (на карточке БЦ — оглавление). */
  secondRow?: ReactNode;
};

const TOP_LINKS: { to: string; label: string }[] = [
  { to: '/minsk/bcminsk/analytics', label: 'Аналитика' },
  { to: '/minsk/bcminsk/rating', label: 'Рейтинги' },
  { to: '/minsk/bcminsk/gid', label: 'Справочник' },
];

function rowLinkClass(active: boolean): string {
  return cn(
    'flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-muted',
    active ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink',
  );
}

export function CatalogTopNav({ centers, width = 'max-w-6xl', secondRow }: CatalogTopNavProps) {
  const [open, setOpen] = useState(false);
  // Ниже md панель — единственный способ навигации, и все четыре оси подряд
  // дают экран на ~50 пунктов. Поэтому там группы свёрнуты (раскрыта одна,
  // по тапу), а от md раскладка колоночная и сворачивать нечего.
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const { pathname } = useLocation();
  const rootRef = useRef<HTMLElement>(null);

  // Закрывать меню при переходе: react-router меняет URL без перезагрузки,
  // сама панель при этом остаётся раскрытой поверх новой страницы.
  useEffect(() => {
    setOpen(false);
    setExpandedGroup(null);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  const groups = useMemo<MenuGroup[]>(() => {
    if (!centers || centers.length === 0) return [];
    const result: MenuGroup[] = [];
    const district = districtSlices(centers);
    if (district.length > 0) result.push({ kind: 'flat', label: 'По району', items: district });
    const metroLines = metroSlicesByLine(centers);
    if (metroLines.length > 0) result.push({ kind: 'metro', label: 'У метро', lines: metroLines });
    const businessClass = classSlices(centers);
    if (businessClass.length > 0) result.push({ kind: 'flat', label: 'По классу', items: businessClass });
    const type = statusSlices(centers);
    if (type.length > 0) result.push({ kind: 'flat', label: 'Тип', items: type });
    return result;
  }, [centers]);

  // Раскладка панели: [районы] [метро] [класс + тип].
  const columns = useMemo<MenuGroup[][]>(() => {
    if (groups.length === 0) return [];
    return [groups.slice(0, 1), groups.slice(1, 2), groups.slice(2)].filter((c) => c.length > 0);
  }, [groups]);

  const activeTop = TOP_LINKS.find((l) => l.to === pathname)?.to;
  // Всё остальное под /minsk/bcminsk (каталог, хабы, карточки) плюс
  // избранное — это «Бизнес-центры».
  const catalogActive =
    !activeTop && (pathname === '/minsk/bcminsk' || pathname.startsWith('/minsk/bcminsk/') || pathname.startsWith('/favorites/'));

  const linkClass = (active: boolean) =>
    cn(
      'whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition-colors',
      active ? 'bg-surface-muted text-ink' : 'text-ink-muted hover:text-ink',
    );

  return (
    <header
      ref={rootRef}
      className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur-md"
    >
      <div className={cn('mx-auto flex items-center justify-between gap-3 px-4 py-4 sm:px-8', width)}>
        <Link to="/minsk" className="text-lg font-extrabold tracking-wide text-ink">
          <span className="font-black text-primary">RED</span>EVELOPMENT
        </Link>

        <nav aria-label="Разделы каталога" className="flex items-center gap-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="catalog-menu-panel"
            onClick={() => setOpen((v) => !v)}
            className={cn(linkClass(Boolean(catalogActive)), 'flex items-center gap-1')}
          >
            {/* На узком экране в шапке помещается только бургер — подпись
                уезжает, роль кнопки при этом та же, поэтому aria-label. */}
            <span className="hidden md:inline">Бизнес-центры</span>
            <span className="sr-only md:hidden">Меню каталога</span>
            {open ? (
              <X aria-hidden="true" className="h-5 w-5 md:hidden" />
            ) : (
              <Menu aria-hidden="true" className="h-5 w-5 md:hidden" />
            )}
            <ChevronDown
              aria-hidden="true"
              className={cn('hidden h-4 w-4 transition-transform md:block', open && 'rotate-180')}
            />
          </button>
          {TOP_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(linkClass(activeTop === link.to), 'hidden md:block')}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      {secondRow && <div className={cn('mx-auto px-4 pb-2 sm:px-8', width)}>{secondRow}</div>}

      {/* Панель всегда в разметке, закрытая прячется классом, а не условным
          рендером: так полсотни ссылок на хабы попадают в статический HTML
          пререндера (scripts/prerender.mjs) с каждой страницы каталога —
          ровно то внутреннее перелинкование, ради которого меню и делается.
          При условном рендере в снимке не было бы ни одной из них. */}
      <div
        id="catalog-menu-panel"
        className={cn(
          // Фон непрозрачный, в отличие от самой шапки: сквозь bg-bg/95 с
          // блюром заголовок страницы под панелью всё равно читался и
          // мешался со списком ссылок.
          'absolute inset-x-0 top-full max-h-[75svh] overflow-y-auto border-b border-border bg-bg',
          open ? 'block' : 'hidden',
        )}
        style={{ boxShadow: '0 16px 32px rgba(0,0,0,0.12)' }}
      >
        {/* Панель шире, чем сама шапка на текстовых страницах (там контент
            max-w-3xl): в три колонки со списком станций 768 px не хватает —
            названия вроде «Площадь Франтишка Богушевича» ломались на три
            строки. Ширина панели одна на весь каталог и равна ширине его
            главной страницы. */}
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8">
          {groups.length === 0 ? (
            <p className="text-sm text-ink-muted">Загружаем каталог…</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)_minmax(0,1fr)] lg:gap-8">
              {/* Районы и метро — по своей колонке; класс и тип короткие,
                  поэтому делят третью, иначе grid перенёс бы тип под
                  районы, в начало второго ряда. Вертикальная линия между
                  колонками (владелец, 2026-09-22: «отдели чуть больше
                  дизайном друг от друга») — только от lg, где колонки
                  стоят рядом; на mobile/tablet они и так расположены одна
                  под другой с обычным gap. border-border-strong, не
                  обычный border-border: на фоне панели (bg-bg, #f0efed)
                  обычная граница (#e7e5e2) почти не видна — разница всего
                  в одиннадцать пунктов на канал. */}
              {columns.map((column, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex min-w-0 flex-col gap-5',
                    index > 0 && 'lg:border-l lg:border-border-strong lg:pl-8',
                  )}
                >
                  {column.map((group, groupIndex) => (
                    <div
                      key={group.label}
                      className={cn(
                        'flex min-w-0 flex-col gap-2',
                        // Та же линия-разделитель, только горизонтальная —
                        // между «По классу» и «Тип», которые делят третью
                        // колонку и без неё выглядели одним списком.
                        groupIndex > 0 && 'border-t border-border-strong pt-5',
                      )}
                    >
                      <button
                        type="button"
                        aria-expanded={expandedGroup === group.label}
                        onClick={() => setExpandedGroup((v) => (v === group.label ? null : group.label))}
                        className="flex items-center justify-between gap-2 py-1.5 text-left text-sm font-bold text-ink md:pointer-events-none md:py-0 md:text-[13px] md:font-extrabold md:uppercase md:tracking-wide md:text-ink"
                      >
                        {group.label}
                        <ChevronDown
                          aria-hidden="true"
                          className={cn(
                            'h-4 w-4 transition-transform md:hidden',
                            expandedGroup === group.label && 'rotate-180',
                          )}
                        />
                      </button>

                      {group.kind === 'metro' ? (
                        <div
                          // Две колонки для списка станций — через CSS
                          // columns, а не flex: `md:flex` и `md:block` в
                          // одном классе конфликтуют (побеждает не тот, что
                          // записан последним в строке, а тот, что ниже в
                          // самом CSS Tailwind), и список молча оставался
                          // одноколоночным. break-inside-avoid на каждой
                          // ветке — чтобы колонка не разрывала её посередине,
                          // отделяя заголовок с кружком от своих станций.
                          className={cn(expandedGroup === group.label ? 'block' : 'hidden', 'md:block md:columns-2 md:gap-x-8')}
                        >
                          {group.lines.map((line) => (
                            <div key={line.id} className="mb-4 break-inside-avoid last:mb-0">
                              <div className="mb-1.5 flex items-center gap-2 text-xs font-bold text-ink-muted">
                                {line.dotClass && <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', line.dotClass)} />}
                                {line.label}
                              </div>
                              <ul className="flex flex-col gap-0.5">
                                {line.stations.map((station) => (
                                  <li key={station.key}>
                                    <Link to={station.url} className={rowLinkClass(station.url === pathname)}>
                                      <span className="min-w-0">{station.label}</span>
                                      <span className="shrink-0 text-xs text-ink-faint">{station.count}</span>
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <ul className={cn(expandedGroup === group.label ? 'flex' : 'hidden', 'flex-col gap-0.5 md:flex')}>
                          {group.items.map((item) => (
                            <li key={item.key}>
                              <Link to={item.url} className={rowLinkClass(item.url === pathname)}>
                                <span className="min-w-0">{item.label}</span>
                                <span className="shrink-0 text-xs text-ink-faint">{item.count}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Ниже md эти три пункта из шапки убраны (там только бургер) —
              значит, попасть в них можно лишь отсюда. */}
          <div className="flex flex-col gap-0.5 border-t border-border pt-4 md:hidden">
            {TOP_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  'rounded-lg px-2 py-2 text-sm font-semibold transition-colors hover:bg-surface-muted',
                  activeTop === link.to ? 'text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
