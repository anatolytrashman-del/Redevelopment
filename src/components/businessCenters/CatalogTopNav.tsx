import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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

type TopNavEntry = { kind: 'link'; to: string; label: string } | { kind: 'ratings' };

const TOP_LINKS: TopNavEntry[] = [
  { kind: 'link', to: '/minsk/bcminsk/analytics', label: 'Аналитика' },
  { kind: 'ratings' },
  { kind: 'link', to: '/minsk/bcminsk/gid', label: 'Справочник' },
];

// «Рейтинги» — единственный пункт с подменю (владелец, 2026-09-22: «добавляй
// в меню с понятными и не длинными названиями», после того как 4 новые
// страницы рейтингов оказались доступны только по перелинковке внутри самих
// себя, без входа из шапки). Короткие подписи вместо H1 страниц (у «Лучших
// бизнес-центров Минска» — просто «Класс A», у «Лучших…классов B и C» —
// «Классы B и C»), чтобы список умещался в узкий выпадающий список.
const RATING_LINKS: { to: string; label: string }[] = [
  { to: '/minsk/bcminsk/rating', label: 'Класс A' },
  { to: '/minsk/bcminsk/rating/b-plus', label: 'Класс B+' },
  { to: '/minsk/bcminsk/rating/b-c', label: 'Классы B и C' },
  { to: '/minsk/bcminsk/rating/samye-bolshie', label: 'Самые большие' },
  { to: '/minsk/bcminsk/rating/samye-dostupnye', label: 'Самые доступные' },
];

// Ширина контейнера контента для каждого значения пропа `width` — ровно те
// же величины, что стоят за классами Tailwind (max-w-3xl = 48rem и т.д.).
// Нужны, чтобы CSS-формула отступа панели повторяла `mx-auto max-w-* ` без
// замеров в JS: другого способа узнать ширину чужого контейнера из CSS нет.
// Меняется `width` у страницы — меняется и ключ здесь.
const PAGE_CONTENT_WIDTH: Record<string, string> = {
  'max-w-3xl': '48rem',
  'max-w-5xl': '64rem',
  'max-w-6xl': '72rem',
  'max-w-7xl': '80rem',
};

function rowLinkClass(active: boolean): string {
  return cn(
    'flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-muted',
    active ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink',
  );
}

// Отдельный маленький выпадающий список, а не расширение общей mega-панели
// «Бизнес-центры»: та панель строится из каталога (classSlices/districtSlices
// и т.п.) и держит собственное состояние открытия/раскрытых групп — здесь же
// 5 фиксированных ссылок без данных, проще и безопаснее держать своим
// компонентом со своим click-outside/Escape, чем вплетать в чужую разметку.
function RatingsDropdown({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
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

  const active = RATING_LINKS.some((l) => l.to === pathname);

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="ratings-menu-panel"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition-colors',
          active ? 'bg-surface-muted text-ink' : 'text-ink-muted hover:text-ink',
        )}
      >
        Рейтинги
        <ChevronDown aria-hidden="true" className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          id="ratings-menu-panel"
          className="absolute left-0 top-full z-50 mt-1 min-w-[210px] rounded-xl border border-border bg-bg py-2"
          style={{ boxShadow: '0 16px 32px rgba(0,0,0,0.12)' }}
        >
          {RATING_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                'block px-4 py-2 text-sm transition-colors',
                link.to === pathname ? 'font-semibold text-ink' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
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

  const activeTop = TOP_LINKS.find((l) => l.kind === 'link' && l.to === pathname) as
    | Extract<TopNavEntry, { kind: 'link' }>
    | undefined;
  const ratingsActive = RATING_LINKS.some((l) => l.to === pathname);
  // Всё остальное под /minsk/bcminsk (каталог, хабы, карточки) плюс
  // избранное — это «Бизнес-центры». Страницы рейтингов тоже живут под
  // /minsk/bcminsk/, поэтому явно исключены — иначе подсвечивались бы сразу
  // два пункта шапки.
  const catalogActive =
    !activeTop &&
    !ratingsActive &&
    (pathname === '/minsk/bcminsk' || pathname.startsWith('/minsk/bcminsk/') || pathname.startsWith('/favorites/'));

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
      {/* Пункты меню стоят сразу за логотипом, а не у правого края
          (владелец, 2026-09-22: «меню переносим в левый край страницы»,
          «оно на главной прижато к правому краю, а должно быть слева») —
          та же раскладка, что и на mts.ru, с которого владелец начал
          разговор о меню: логотип, сразу за ним разделы, справа пусто.
          Ниже md в шапке остаётся только бургер, и он по-прежнему
          прижимается к правому краю (justify-between), иначе прилипнет к
          логотипу и промахнуться по нему пальцем станет легко. */}
      <div className={cn('mx-auto flex items-center justify-between gap-3 px-4 py-4 sm:px-8 md:justify-start md:gap-10', width)}>
        <Link to="/minsk" className="shrink-0 text-lg font-extrabold tracking-wide text-ink">
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
          {TOP_LINKS.map((entry) =>
            entry.kind === 'ratings' ? (
              <RatingsDropdown key="ratings" pathname={pathname} />
            ) : (
              <Link
                key={entry.to}
                to={entry.to}
                className={cn(linkClass(activeTop?.to === entry.to), 'hidden md:block')}
              >
                {entry.label}
              </Link>
            ),
          )}
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
        {/* Содержимое панели прижато к левому краю страницы — к той же
            линии, где стоит логотип и начинается контент (владелец,
            2026-09-22: «оно на главной прижато к правому краю, а должно
            быть слева»). Вправо оно тянется дальше контейнера страницы: в
            три колонки со списком станций 768 px не хватает, названия
            вроде «Площадь Франтишка Богушевича» ломаются на три строки.
            Поэтому левая граница задана жёстко, а ширина содержимого
            ограничена мягко (max-w-[72rem] на внутреннем блоке).

            Отступ считает CSS, а НЕ замер в JS: формула повторяет ровно то,
            что делает `mx-auto max-w-* px-4 sm:px-8` у шапки и у main —
            половина свободного места плюс боковое поле, но не меньше самого
            поля на узком экране. Замер тут был ошибкой: пререндер
            (scripts/prerender.mjs) выполняет эффекты и ЗАПЕКАЕТ результат в
            статический HTML — в снимке оставался `padding-left: 96px`,
            посчитанный для ширины окна сборщика, и до гидратации (а entry у
            нас отложен, см. defer-entry-script.mjs) все видели чужую
            линию. Проценты берутся от ширины самой панели, то есть от
            ширины документа без полосы прокрутки, — в отличие от 100vw,
            которая её включает. */}
        <div
          className="flex flex-col gap-6 py-6 pr-4 pl-[max(1rem,calc((100%-var(--page-w))/2+1rem))] sm:pr-8 sm:pl-[max(2rem,calc((100%-var(--page-w))/2+2rem))]"
          style={{ '--page-w': PAGE_CONTENT_WIDTH[width] ?? PAGE_CONTENT_WIDTH['max-w-6xl'] } as CSSProperties}
        >
          <div className="flex max-w-[72rem] flex-col gap-6">
          {groups.length === 0 ? (
            <p className="text-sm text-ink-muted">Загружаем каталог…</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,2.3fr)_minmax(0,0.85fr)] lg:gap-8">
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
            {TOP_LINKS.map((entry) =>
              entry.kind === 'ratings' ? (
                <div key="ratings" className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    aria-expanded={expandedGroup === 'Рейтинги'}
                    onClick={() => setExpandedGroup((v) => (v === 'Рейтинги' ? null : 'Рейтинги'))}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm font-semibold transition-colors hover:bg-surface-muted',
                      ratingsActive ? 'text-ink' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    Рейтинги
                    <ChevronDown
                      aria-hidden="true"
                      className={cn('h-4 w-4 transition-transform', expandedGroup === 'Рейтинги' && 'rotate-180')}
                    />
                  </button>
                  <div className={cn('flex-col gap-0.5 pl-3', expandedGroup === 'Рейтинги' ? 'flex' : 'hidden')}>
                    {RATING_LINKS.map((link) => (
                      <Link key={link.to} to={link.to} className={rowLinkClass(link.to === pathname)}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  key={entry.to}
                  to={entry.to}
                  className={cn(
                    'rounded-lg px-2 py-2 text-sm font-semibold transition-colors hover:bg-surface-muted',
                    activeTop?.to === entry.to ? 'text-ink' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {entry.label}
                </Link>
              ),
            )}
          </div>
          </div>
        </div>
      </div>
    </header>
  );
}
