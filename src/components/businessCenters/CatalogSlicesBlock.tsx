import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { shortName, streetOfAddress } from '../../lib/businessCenterDisplay';
import {
  classHubUrl,
  districtHubUrl,
  microdistrictHubUrl,
  metroHubUrl,
  metroHubDistance,
  streetHubUrl,
} from '../../lib/businessCenterHubs';
import { BUSINESS_CENTER_CLASSES, type BusinessCenter } from '../../data/businessCenters';

// «Великий камень» — не район Минска, поэтому в списке идёт последним,
// а не по алфавиту вместе с городскими (то же правило в фильтре каталога).
const OUT_OF_TOWN_DISTRICT = 'Великий камень';

// Срезы каталога: чипы SEO-хабов (класс, район, микрорайон, метро, улица,
// стройка) плюс алфавитный перечень ВСЕХ зданий. До 2026-09-22 блок жил под
// результатами каталога, включая его главную; владелец попросил расчистить
// главную, и блок уехал на страницу-гид /minsk/bcminsk/gid — но остался на
// хабах, поэтому вёрстка и подсчёты вынесены сюда: две копии этой логики
// разошлись бы, а цена расхождения — полсотни хаб-страниц без внутренних
// ссылок и часть каталога, до которой краулеру не дойти (карточек в сетке
// рендерится 48, «Показать ещё» — клиентская кнопка, в пререндер не
// попадает).
export function CatalogSlicesBlock({ centers }: { centers: BusinessCenter[] }) {
  const availableClasses = useMemo(() => {
    const present = new Set(centers.map((c) => c.businessClass).filter((v): v is NonNullable<typeof v> => !!v));
    return BUSINESS_CENTER_CLASSES.filter((cls) => present.has(cls));
  }, [centers]);

  const districts = useMemo(() => {
    const all = Array.from(new Set(centers.map((c) => c.district).filter((v): v is string => !!v)));
    const inCity = all.filter((d) => d !== OUT_OF_TOWN_DISTRICT).sort((a, b) => a.localeCompare(b, 'ru'));
    const outOfCity = all.filter((d) => d === OUT_OF_TOWN_DISTRICT);
    return [...inCity, ...outOfCity];
  }, [centers]);

  const microdistricts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of centers) if (c.microdistrict) counts[c.microdistrict] = (counts[c.microdistrict] ?? 0) + 1;
    return Object.entries(counts)
      .filter(([name]) => microdistrictHubUrl(name) !== null)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  }, [centers]);

  const metroStations = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of centers) {
      for (const st of c.nearestMetroStations) {
        if (metroHubDistance(c, st.name) !== null && metroHubUrl(st.name)) counts[st.name] = (counts[st.name] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  }, [centers]);

  const streets = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of centers) {
      const st = streetOfAddress(c.address);
      if (streetHubUrl(st)) counts[st] = (counts[st] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  }, [centers]);

  const allCentersAlphabetical = useMemo(
    () => [...centers].sort((a, b) => shortName(a).localeCompare(shortName(b), 'ru')),
    [centers],
  );

  if (centers.length === 0) return null;

  const groups: { label: string; items: { key: string; name: string; url: string | null }[] }[] = [
    {
      label: 'По классу',
      items: availableClasses.map((cls) => ({ key: cls, name: `Класс ${cls}`, url: classHubUrl(cls) })),
    },
    {
      label: 'По району',
      items: districts.map((d) => ({ key: d, name: d, url: districtHubUrl(d) })),
    },
    {
      label: 'По микрорайону',
      items: microdistricts.map(([name, count]) => ({ key: name, name: `${name} (${count})`, url: microdistrictHubUrl(name) })),
    },
    {
      label: 'У метро',
      items: metroStations.map(([name, count]) => ({ key: name, name: `${name} (${count})`, url: metroHubUrl(name) })),
    },
    {
      label: 'По улице',
      items: streets.map(([name, count]) => ({ key: name, name: `${name} (${count})`, url: streetHubUrl(name) })),
    },
    {
      label: 'Статус',
      items: [{ key: 'uc', name: 'Строящиеся', url: '/minsk/bcminsk/stroyashchiesya' }],
    },
  ];

  return (
    <div className={cn('flex flex-col gap-5 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="text-lg font-bold text-ink">Срезы каталога</h2>
      {groups.map((group) => {
        const items = group.items.filter((i) => i.url);
        if (items.length === 0) return null;
        return (
          <div key={group.label} className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{group.label}</span>
            <div className="flex flex-wrap gap-2">
              {items.map((i) => (
                <Link
                  key={i.key}
                  to={i.url as string}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary-hover"
                >
                  {i.name}
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
