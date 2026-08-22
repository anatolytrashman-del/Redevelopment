import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bus, Building2, GraduationCap, MapPin, ShoppingBag, TrainFront } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow, glassPillClass, glassPillShadow } from '../lib/glass';
import { setGenericPageMeta, setArticleJsonLd, setFaqJsonLd } from '../lib/pageMeta';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import type { FaqItem } from '../components/ui/FaqAccordion';

const PAGE_URL = 'https://redevelopment.pro/rayon-minsk-mir';
const TITLE = 'Минск Мир для бизнеса: инфраструктура, транспорт, коммерческая недвижимость';
const DESCRIPTION =
  'Что в районе Минск Мир есть для бизнеса: 2 станции метро, автобусные маршруты, инфраструктура, деловой квартал. Обзор для тех, кто ищет офис или коммерческую недвижимость по соседству.';
// Обновлять вручную при каждом квартальном пересмотре текста (см. SEO_PLAN.md, Э3-1).
const DATE_MODIFIED = '2026-08-22';

// Пустая строка — карты пока нет (нужна ссылка из Яндекс.Конструктора карт
// от владельца, тот же приём, что и ObjectMapWidget.tsx: только src=
// iframe-ссылка вида yandex.ru/map-widget/v1/?um=constructor:<id>). Секция
// с картой просто не рендерится, пока сюда не подставят реальный URL.
const MAP_EMBED_URL = '';

// Источник фактов: Википедия, статья "Минск Мир" (ru.wikipedia.org,
// прислана владельцем 2026-08-22) + веб-поиск (Avia Mall, инфраструктура).
// Официальные координаты района, обе станции метро, реальные номера
// автобусных/троллейбусных маршрутов — оттуда, не выдуманы.
const DISTRICT_COORDS = '53°52′04″ с.ш. 27°32′37″ в.д.';

const statTiles: { icon: LucideIcon; value: string; label: string }[] = [
  { icon: TrainFront, value: '2', label: 'станции метро на территории' },
  { icon: Building2, value: '2015–2027', label: 'годы застройки — район растёт сейчас' },
  { icon: ShoppingBag, value: '138 200 м²', label: 'площадь Avia Mall — крупнейший ТЦ Минска' },
  { icon: Bus, value: '14', label: 'автобусных и троллейбусных маршрутов' },
];

const busRoutes = ['4', '47с', '53', '56', '73', '84', '100', '107', '124', '172'];
const trolleyRoutes = ['19', '27', '59', '82'];

const districtFaq: FaqItem[] = [
  {
    question: 'Сколько станций метро в районе Минск Мир?',
    answer:
      'Две — «Ковальская Слобода» и «Аэродромная», обе на Зеленолужской линии (третья линия Минского метрополитена).',
  },
  {
    question: 'Как добраться до района на автобусе или троллейбусе?',
    answer:
      'Автобусы: 4, 47с, 53, 56, 73, 84, 100, 107, 124, 172. Троллейбусы: 19, 27, 59, 82 — маршруты связывают район с разными частями Минска, включая вокзал и ж/д станцию «Минск-Южный».',
  },
  {
    question: 'Далеко ли Red One от Минск Мира?',
    answer: 'Red One расположен по соседству с районом — не на его территории, но в непосредственной близости.',
  },
  {
    question: 'Что уже открыто в районе для бизнеса?',
    answer:
      'Крупнейший в Минске торговый центр Avia Mall (138 200 м², якорный арендатор — сеть гипермаркетов Green), строится Международный финансовый центр — деловой кластер с пешеходными галереями и подземным паркингом.',
  },
];

// Информационный гид, не продающая страница объекта (SEO_PLAN.md, Э3-1) —
// по Wordstat «минск мир» это на 99%+ спрос на квартиры (см. журнал плана),
// узкая офисная/коммерческая часть держится на паре сотен показов в месяц,
// а «район минск мир» — отдельная, более осмысленная для нас фраза (989/мес).
// Задача страницы — не биться за широкое «минск мир», а закрыть эту нишу и
// вести заинтересованных дальше на /one. Обратной ссылки с /one сюда нет
// осознанно — решение владельца не отвлекать с продающей страницы.
export function DistrictGuidePage() {
  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL });
    setArticleJsonLd({
      headline: TITLE,
      description: DESCRIPTION,
      url: PAGE_URL,
      datePublished: '2026-08-22',
      dateModified: DATE_MODIFIED,
    });
    setFaqJsonLd(districtFaq);
  }, []);

  return (
    <div className="min-h-svh bg-bg">
      <div className="border-b border-border py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-center px-4 sm:px-8">
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
        </div>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 sm:px-8">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-ink-muted">Обновлено: август 2026</p>
          <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">
            Офисы и коммерческая недвижимость в районе Минск Мир
          </h1>
          <p className="text-base text-ink-muted">
            Минск Мир — самый активно строящийся многофункциональный район Минска: жильё, деловой квартал,
            парковая зона и крупнейший в городе торговый центр Avia Mall. Застройка продолжается прямо сейчас,
            до 2027 года. По соседству — деловой центр Red One (Полтавская, 10). Разберём, что в районе сегодня
            есть для бизнеса.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-ink-faint">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {DISTRICT_COORDS} · Октябрьский район Минска
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statTiles.map(({ icon: Icon, value, label }) => (
            <div
              key={label}
              className={cn('flex flex-col gap-2 p-4', glassCardClass)}
              style={glassCardShadow}
            >
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center text-ink', glassPillClass)} style={glassPillShadow}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="text-lg font-extrabold text-ink">{value}</div>
              <p className="text-xs leading-snug text-ink-muted">{label}</p>
            </div>
          ))}
        </div>

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <TrainFront className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Транспорт</h2>
          </div>
          <p className="text-sm text-ink-muted">
            Две станции метро на Зеленолужской линии — «Ковальская Слобода» и «Аэродромная». Рядом — Национальный
            аэропорт Минск и Южная магистраль, удобный выезд на кольцевую.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex flex-wrap items-start gap-2">
              <span className="shrink-0 pt-1 text-xs font-semibold text-ink-muted">Автобусы:</span>
              <div className="flex flex-wrap gap-1.5">
                {busRoutes.map((r) => (
                  <span key={r} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink">
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <span className="shrink-0 pt-1 text-xs font-semibold text-ink-muted">Троллейбусы:</span>
              <div className="flex flex-wrap gap-1.5">
                {trolleyRoutes.map((r) => (
                  <span key={r} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <GraduationCap className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Инфраструктура</h2>
          </div>
          <p className="text-sm text-ink-muted">
            В районе работают три школы и четыре детских сада (строится пятый), детская и взрослая поликлиники —
            актуально для сотрудников с детьми. По соседству с Red One, через дорогу — ещё пять детских садов.
          </p>
        </div>

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 shrink-0 text-ink" />
            <h2 className="text-lg font-bold text-ink">Деловая часть района</h2>
          </div>
          <p className="text-sm text-ink-muted">
            Avia Mall — крупнейший торговый центр Минска, 138 200 м² (Братская, 18), якорный арендатор — сеть
            гипермаркетов Green. Рядом строится Международный финансовый центр — деловой кластер с пешеходными
            галереями и подземным паркингом.
          </p>
          {/* TODO: расширить список арендаторов района, когда владелец пришлёт данные
              (не только Avia Mall) — см. журнал SEO_PLAN.md. */}
        </div>

        {MAP_EMBED_URL && (
          <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 shrink-0 text-ink" />
              <h2 className="text-lg font-bold text-ink">Карта района</h2>
            </div>
            <div className="overflow-hidden rounded-control border border-border">
              <iframe
                src={MAP_EMBED_URL}
                title="Карта района Минск Мир"
                className="h-80 w-full"
                loading="lazy"
              />
            </div>
          </div>
        )}

        <FaqAccordion title="Частые вопросы о районе" items={districtFaq} />

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Red One — по соседству с районом</h2>
          <p className="text-sm text-ink-muted">
            Приватные кабинеты и фиксированные рабочие места в собственном здании рядом с Минск Миром — с
            дизайнерской отделкой, парковкой и онлайн-бронированием без предоплаты.
          </p>
          <Link to="/one" className="w-fit text-sm font-semibold text-primary hover:underline">
            Смотреть кабинеты в Red One →
          </Link>
        </div>
      </div>
    </div>
  );
}
