import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Banknote, BusFront, Coffee, Dumbbell, Landmark, Pill, ShoppingBag, TrainFront, Utensils } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { formatMeters, groupNearbyPlaces, type NearbyCategoryGroup } from '../../lib/nearbyPlaces';
import type { BusinessCenterNearbyPlace, NearbyPlaceCategory } from '../../data/businessCenterNearbyPlaces';
import { loadYmaps } from '../../lib/yandexMaps';

// ВАРИАНТ «Б» блока «Что рядом» — человеческий пересказ вместо приборной
// панели: без колец-радаров, без нумерованных меток и без сетки кнопок.
// Три темы вместо десяти категорий, внутри — обычные фразы с именами мест;
// карта спокойная и второстепенная, она иллюстрирует текст, а не наоборот.

const COLORS: Record<NearbyPlaceCategory, string> = {
  metro: '#e4152b', transport_stop: '#2563eb', grocery: '#15803d', pharmacy: '#059669',
  bank: '#475569', atm: '#64748b', coffee: '#b45309', cafe: '#c2410c', fitness: '#db2777',
  shop: '#7c3aed', other: '#6e7781',
};

const NUMBER_WORDS = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять',
  'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать',
  'девятнадцать', 'двадцать'];

// «ещё семь кофеен» читается по-человечески, «ещё 7 кофеен» — как выгрузка.
function word(count: number, forms: [string, string, string], feminine = false): string {
  const numeral = count <= 20
    ? (count === 1 ? (feminine ? 'одна' : 'один') : count === 2 ? (feminine ? 'две' : 'два') : NUMBER_WORDS[count])
    : String(count);
  const mod100 = count % 100;
  const mod10 = count % 10;
  const form = mod100 >= 11 && mod100 <= 14 ? forms[2] : mod10 === 1 ? forms[0] : mod10 >= 2 && mod10 <= 4 ? forms[1] : forms[2];
  return `${numeral} ${form}`;
}

interface Topic {
  key: string;
  title: string;
  icon: ComponentType<any>;
  color: string;
  categories: NearbyPlaceCategory[];
  sentences: string[];
}

function buildTopics(groups: NearbyCategoryGroup[]): Topic[] {
  const by = (category: NearbyPlaceCategory) => groups.find((group) => group.category === category);
  const topics: Topic[] = [];

  const metro = by('metro');
  const stops = by('transport_stop');
  if (metro || stops) {
    const sentences: string[] = [];
    if (metro) {
      const [first, second] = metro.places;
      sentences.push(
        second
          ? `До метро «${first.name}» — ${formatMeters(first.distanceMeters)}, «${second.name}» чуть дальше, ${formatMeters(second.distanceMeters)}.`
          : `До метро «${first.name}» — ${formatMeters(first.distanceMeters)}.`,
      );
    }
    if (stops) {
      sentences.push(
        stops.places.length > 1
          ? `Ближайшая остановка — «${stops.places[0].name}», ${formatMeters(stops.places[0].distanceMeters)}; всего вокруг ${word(stops.places.length, ['остановка', 'остановки', 'остановок'], true)}.`
          : `Остановка «${stops.places[0].name}» — ${formatMeters(stops.places[0].distanceMeters)}.`,
      );
    }
    topics.push({ key: 'transport', title: 'Как добираться', icon: TrainFront, color: COLORS.metro, categories: ['metro', 'transport_stop'], sentences });
  }

  const grocery = by('grocery');
  const pharmacy = by('pharmacy');
  const bank = by('bank');
  const atm = by('atm');
  if (grocery || pharmacy || bank || atm) {
    const sentences: string[] = [];
    if (grocery) {
      sentences.push(
        grocery.places.length > 1
          ? `Продукты — «${grocery.places[0].name}» в ${formatMeters(grocery.places[0].distanceMeters)}, рядом ещё ${word(grocery.places.length - 1, ['магазин', 'магазина', 'магазинов'])}.`
          : `Продукты — «${grocery.places[0].name}», ${formatMeters(grocery.places[0].distanceMeters)}.`,
      );
    }
    if (pharmacy) {
      sentences.push(
        pharmacy.places.length > 1
          ? `Аптека «${pharmacy.places[0].name}» — ${formatMeters(pharmacy.places[0].distanceMeters)}, поблизости ${word(pharmacy.places.length, ['аптека', 'аптеки', 'аптек'], true)}.`
          : `Аптека «${pharmacy.places[0].name}» — ${formatMeters(pharmacy.places[0].distanceMeters)}.`,
      );
    }
    if (bank && atm) {
      sentences.push(`Банк «${bank.places[0].name}» в ${formatMeters(bank.places[0].distanceMeters)}, ближайший банкомат — в ${formatMeters(atm.places[0].distanceMeters)}.`);
    } else if (bank) {
      sentences.push(`Банк «${bank.places[0].name}» — ${formatMeters(bank.places[0].distanceMeters)}.`);
    } else if (atm) {
      sentences.push(`Ближайший банкомат — в ${formatMeters(atm.places[0].distanceMeters)}.`);
    }
    topics.push({ key: 'daily', title: 'Между делами', icon: ShoppingBag, color: COLORS.grocery, categories: ['grocery', 'pharmacy', 'bank', 'atm'], sentences });
  }

  const coffee = by('coffee');
  const cafe = by('cafe');
  const fitness = by('fitness');
  if (coffee || cafe || fitness) {
    const sentences: string[] = [];
    if (coffee) {
      sentences.push(
        coffee.places.length > 1
          ? `Кофе — «${coffee.places[0].name}» в ${formatMeters(coffee.places[0].distanceMeters)}, и ещё ${word(coffee.places.length - 1, ['кофейня', 'кофейни', 'кофеен'], true)} вокруг.`
          : `Кофейня «${coffee.places[0].name}» — ${formatMeters(coffee.places[0].distanceMeters)}.`,
      );
    }
    if (cafe) {
      sentences.push(`Пообедать — «${cafe.places[0].name}», ${formatMeters(cafe.places[0].distanceMeters)}${cafe.places.length > 1 ? `, всего ${word(cafe.places.length, ['место', 'места', 'мест'])}` : ''}.`);
    }
    if (fitness) {
      sentences.push(`Спортзал «${fitness.places[0].name}» — ${formatMeters(fitness.places[0].distanceMeters)}.`);
    }
    topics.push({ key: 'after', title: 'Обед и после работы', icon: Coffee, color: COLORS.coffee, categories: ['coffee', 'cafe', 'fitness'], sentences });
  }

  return topics;
}

const CATEGORY_ICON: Partial<Record<NearbyPlaceCategory, ComponentType<any>>> = {
  metro: TrainFront, transport_stop: BusFront, grocery: ShoppingBag, pharmacy: Pill,
  bank: Landmark, atm: Banknote, coffee: Coffee, cafe: Utensils, fitness: Dumbbell,
};


// Карта здесь второстепенна: она иллюстрирует текст, а не заменяет его —
// поэтому ни колец-радаров, ни нумерации. Пока тема не выбрана, подписано
// ближайшее в каждой категории; выбрали тему — её точки без подписей, имена
// к этому моменту уже перечислены выше.
function QuietMap({
  center,
  title,
  points,
}: {
  center: { lat: number; lng: number };
  title: string;
  points: { place: BusinessCenterNearbyPlace; color: string; label: string | null }[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const marksRef = useRef<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    loadYmaps().then((ymaps) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new ymaps.Map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: 15,
        controls: ['zoomControl', 'fullscreenControl'],
      }, { suppressMapOpenBlock: true });
      map.behaviors.disable('scrollZoom');
      map.geoObjects.add(new ymaps.Placemark([center.lat, center.lng], { iconContent: title }, {
        preset: 'islands#blackStretchyIcon',
        zIndex: 900,
      }));
      mapRef.current = map;
      setStatus('ready');
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; mapRef.current?.destroy?.(); mapRef.current = null; };
  }, [center.lat, center.lng, title]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    void (async () => {
      const ymaps = await loadYmaps();
      for (const mark of marksRef.current) map.geoObjects.remove(mark);
      marksRef.current = [];
      for (const { place, color, label } of points) {
        const mark = new ymaps.Placemark([place.lat, place.lng], {
          iconContent: label ?? '',
          hintContent: `${place.name} — ${formatMeters(place.distanceMeters)}`,
        }, {
          preset: label ? 'islands#stretchyIcon' : 'islands#circleIcon',
          iconColor: color,
        });
        map.geoObjects.add(mark);
        marksRef.current.push(mark);
      }
    })();
  }, [points, status]);

  return (
    <div className="relative h-64 w-full overflow-hidden rounded-2xl bg-surface-muted sm:h-80">
      <div ref={containerRef} className="h-full w-full" />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
          {status === 'error' ? 'Не удалось загрузить карту' : 'Загрузка карты…'}
        </div>
      )}
    </div>
  );
}

export function NearbyInfrastructureV3({
  title,
  center,
  places,
}: {
  title: string;
  center: { lat: number; lng: number };
  places: BusinessCenterNearbyPlace[];
}) {
  const groups = useMemo(() => groupNearbyPlaces(places).filter((group) => group.category !== 'shop'), [places]);
  const topics = useMemo(() => buildTopics(groups), [groups]);
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  const activeTopic = topics.find((topic) => topic.key === openTopic) ?? null;
  const shownGroups = activeTopic
    ? groups.filter((group) => activeTopic.categories.includes(group.category))
    : groups;
  // Когда тема не выбрана, на карте — ближайшее из каждой категории; выбрали
  // тему — все её точки, но мягкими полупрозрачными кружками, без номеров.
  // Без выбранной темы — ближайшее из каждой категории с именем; выбрали тему
  // — все её точки мягкими кружками (имена к этому моменту уже перечислены
  // текстом выше, дублировать их на карте незачем).
  const points = activeTopic
    ? shownGroups.flatMap((group) => group.places.map((place) => ({ place, color: COLORS[group.category], label: null })))
    : shownGroups.map((group) => ({
        place: group.places[0],
        color: COLORS[group.category],
        // Имя банкомата («Приорбанк») ничего не сообщает — на карте это просто точка.
        label: group.category === 'atm' ? null : group.places[0].name,
      }));

  return (
    <div className={cn('flex flex-col gap-6 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-ink">Что рядом</h2>
        <p className="text-sm text-ink-muted">
          Дом стоит в обжитом месте: метро, продукты, аптека и кофе — в соседних кварталах.
        </p>
      </div>

      {/* Три темы вместо десяти категорий: человек думает «как доеду», «где
          пообедать», а не «сколько здесь объектов категории ATM». */}
      <div className="flex flex-col divide-y divide-border">
        {topics.map((topic) => {
          const Icon = topic.icon;
          const isOpen = openTopic === topic.key;
          const topicGroups = groups.filter((group) => topic.categories.includes(group.category));
          const total = topicGroups.reduce((sum, group) => sum + group.places.length, 0);
          return (
            <div key={topic.key} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${topic.color}14` }}
                >
                  <Icon className="h-4.5 w-4.5" style={{ color: topic.color }} />
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-ink">{topic.title}</h3>
                  <p className="text-[15px] leading-relaxed text-ink-muted">{topic.sentences.join(' ')}</p>
                  <button
                    type="button"
                    onClick={() => setOpenTopic(isOpen ? null : topic.key)}
                    className="self-start text-sm font-medium text-ink underline decoration-border-strong underline-offset-4 hover:decoration-ink"
                  >
                    {isOpen ? 'Свернуть' : `Показать на карте · ${total}`}
                  </button>
                </div>
              </div>

              {/* Раскрытая тема — перечисление обычной строкой, а не таблица с
                  номерами: имена читаются подряд, как в разговоре. */}
              {isOpen && (
                <div className="ml-12 flex flex-col gap-2">
                  {topicGroups.map((group) => {
                    const CategoryIcon = CATEGORY_ICON[group.category];
                    const names = group.category === 'atm'
                      ? `${word(group.places.length, ['банкомат', 'банкомата', 'банкоматов'])} поблизости, ближайший в ${formatMeters(group.places[0].distanceMeters)} — названия здесь не важны`
                      : group.places.map((place) => place.name).join(', ');
                    return (
                      <p key={group.category} className="flex gap-2 text-sm leading-relaxed text-ink-muted">
                        {CategoryIcon && <CategoryIcon className="mt-1 h-4 w-4 shrink-0" style={{ color: COLORS[group.category] }} />}
                        <span>
                          <span className="font-medium text-ink">{group.label}.</span> {names}
                        </span>
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <QuietMap center={center} title={title} points={points} />

      <p className="text-xs text-ink-faint">
        Расстояния — по прямой от здания, по данным Яндекс.Карт.
      </p>
    </div>
  );
}
