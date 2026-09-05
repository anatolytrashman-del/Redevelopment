import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Building2,
  Calendar,
  Car,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  Layers,
  MapPin,
  Ruler,
  TrainFront,
  X,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow, glassPillClass, glassPillShadow } from '../lib/glass';
import { Badge } from '../components/ui/Badge';
import { PhotoBlock, FactRow } from '../components/businessCenters/BusinessCenterVisuals';
import { setBreadcrumbJsonLd, setNoIndex, clearNoIndex, setBusinessCenterPageMeta } from '../lib/pageMeta';
import { businessClassTone, shortName, sortByShortName } from '../lib/businessCenterDisplay';
import type { BusinessCenter } from '../data/businessCenters';
import { fetchBusinessCenters } from '../lib/businessCentersApi';
import type { BusinessCenterOffer } from '../data/businessCenterOffers';
import { fetchBusinessCenterOffers } from '../lib/businessCenterOffersApi';

// Отдельная страница одного бизнес-центра (владелец, 2026-09-04: "для SEO
// лучше хаб + отдельная страница на каждый БЦ" — согласился с этим доводом
// и попросил именно так). Визуально — оверлей-«модалка» (та же стилистика,
// что у ImageLightbox.tsx: крестик-закрытие, стрелки влево/вправо по краям
// экрана), но технически обычная полноценная страница со своим URL —
// иначе AI-краулеры/Яндекс без выполнения JS не увидели бы контент, а
// title/canonical/JSON-LD не смогли бы быть уникальными под конкретный БЦ.
// "Закрытие" ведёт не назад в истории браузера, а явно на /minsk/bcminsk —
// так работает предсказуемо и при заходе по прямой ссылке из поиска, когда
// в истории браузера страницы хаба вообще нет.
export function BusinessCenterDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [centers, setCenters] = useState<BusinessCenter[] | null>(null);
  const [offers, setOffers] = useState<BusinessCenterOffer[] | null>(null);

  useEffect(() => {
    fetchBusinessCenters()
      .then(setCenters)
      .catch(() => setCenters([]));
  }, []);

  // Объявления о продаже/аренде из business_center_offers (владелец,
  // 2026-09-05: "хочу спарсить объявления... эту инфу мы будем выводить в
  // полной карточке" — см. scripts/sync-business-center-offers.mjs).
  // Отдельный запрос по слагу, не общий с fetchBusinessCenters — так при
  // переходе на следующий/предыдущий БЦ (тот же компонент, меняется только
  // slug) список объявлений сам перезапрашивается под новый БЦ.
  useEffect(() => {
    if (!slug) return;
    setOffers(null);
    fetchBusinessCenterOffers(slug)
      .then(setOffers)
      .catch(() => setOffers([]));
  }, [slug]);

  // Порядок для "предыдущий/следующий" — тот же алфавит по короткому имени,
  // что и в боковом меню хаба, чтобы стрелки совпадали с порядком, который
  // пользователь уже видел в списке до перехода сюда.
  const sorted = useMemo(() => sortByShortName(centers ?? []), [centers]);
  const center = useMemo(() => sorted.find((c) => c.slug === slug) ?? null, [sorted, slug]);
  const index = center ? sorted.findIndex((c) => c.slug === center.slug) : -1;
  const prev = index > 0 ? sorted[index - 1] : null;
  const next = index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : null;

  const saleRows = useMemo(() => computeOfferRows(offers ?? [], 'sale'), [offers]);
  const rentRows = useMemo(() => computeOfferRows(offers ?? [], 'rent'), [offers]);

  useEffect(() => {
    if (!center) return;
    setBusinessCenterPageMeta(center.slug, center, center.photos[0]);
    setBreadcrumbJsonLd([
      { name: 'Коммерческая недвижимость в Минске', url: 'https://redevelopment.pro/minsk' },
      { name: 'Бизнес-центры Минска', url: 'https://redevelopment.pro/minsk/bcminsk' },
      { name: shortName(center) },
    ]);
  }, [center]);

  // Слаг не найден (опечатка в ссылке, удалённый БЦ) — soft-404: страница
  // остаётся доступной (200, не редирект), но не индексируется, тот же
  // принцип, что и у ObjectLandingPage для неизвестного /:slug.
  useEffect(() => {
    if (centers === null || center) return;
    setNoIndex();
    return () => clearNoIndex();
  }, [centers, center]);

  if (centers === null) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-bg">
        <p className="text-sm text-ink-faint">Загрузка…</p>
      </div>
    );
  }

  if (!center) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bg px-4 text-center">
        <p className="text-base text-ink-muted">Такой бизнес-центр не найден.</p>
        <Link to="/minsk/bcminsk" className="text-sm font-semibold text-primary hover:underline">
          ← Все бизнес-центры Минска
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-bg px-4 py-8 sm:py-14">
      <div className="mx-auto flex max-w-3xl items-center justify-between pb-5">
        <Link to="/minsk" className="text-lg font-extrabold tracking-wide text-ink">
          <span className="font-black text-primary">RED</span>EVELOPMENT
        </Link>
        <Link
          to="/minsk/bcminsk"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <X className="h-4 w-4 shrink-0" />
          Все бизнес-центры
        </Link>
      </div>

      {/* Стрелки влево/вправо по краям экрана — тот же паттерн, что и в
          ImageLightbox.tsx. Только от lg — на мобильном места мало, там
          навигация — строка кнопок под карточкой ниже. */}
      {prev && (
        <Link
          to={`/minsk/bcminsk/${prev.slug}`}
          aria-label={`Предыдущий бизнес-центр: ${shortName(prev)}`}
          className={cn(
            'fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 items-center justify-center rounded-full p-3 text-ink lg:flex',
            glassPillClass,
          )}
          style={glassPillShadow}
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
      )}
      {next && (
        <Link
          to={`/minsk/bcminsk/${next.slug}`}
          aria-label={`Следующий бизнес-центр: ${shortName(next)}`}
          className={cn(
            'fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 items-center justify-center rounded-full p-3 text-ink lg:flex',
            glassPillClass,
          )}
          style={glassPillShadow}
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      )}

      <div className="mx-auto max-w-3xl">
        <div className={cn('overflow-hidden', glassCardClass)} style={glassCardShadow}>
          <div className="relative aspect-[16/9] w-full overflow-hidden">
            <PhotoBlock center={center} />
          </div>

          <div className="flex flex-col gap-4 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="text-2xl font-extrabold leading-tight text-ink">{center.name}</h1>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {center.status === 'under_construction' && <Badge tone="warning">Строится</Badge>}
                {center.businessClass && (
                  <Badge tone={businessClassTone[center.businessClass]}>Класс {center.businessClass}</Badge>
                )}
              </div>
            </div>

            <FactRow icon={MapPin}>{center.address}</FactRow>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {center.totalArea != null && (
                <FactRow icon={Ruler}>{center.totalArea.toLocaleString('ru-RU')} м² общая площадь</FactRow>
              )}
              {center.yearBuilt != null && (
                <FactRow icon={Calendar}>
                  {center.status === 'under_construction' ? `Ожидаемая сдача — ${center.yearBuilt} г.` : `Сдан в ${center.yearBuilt} г.`}
                </FactRow>
              )}
              {center.floors != null && <FactRow icon={Layers}>{center.floors} этажей</FactRow>}
              {center.metro && <FactRow icon={TrainFront}>{center.metro}</FactRow>}
              {center.parking && <FactRow icon={Car}>{center.parking}</FactRow>}
              {center.developer && <FactRow icon={Building2}>{center.developer}</FactRow>}
            </div>

            {center.description && <p className="text-sm text-ink-muted">{center.description}</p>}

            {center.website && (
              <a
                href={center.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Globe className="h-4 w-4 shrink-0" />
                {center.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </div>

        {/* Рынок в этом здании — было списком отдельных объявлений, потом
            статистикой в две строки + ссылками на живой поиск Kufar/Realt.
            Обе правки не прижились: владелец увидел, что ссылка на Kufar в
            реальном браузере открывает общую страницу без фильтра (не
            проверить из песочницы — headless-браузер сюда не достаёт,
            только curl, а он не показывает поведение клиентской гидратации
            SPA), а ссылка на Realt через Google выглядела как костыль —
            "или сделай нормально, или убирай вообще". Ссылки убраны
            полностью. Заодно владелец: "мало данных как будто" — таблица
            расширена разбивкой по типу помещения (то же поле property_type,
            что уже есть в business_center_offers, раньше просто не
            использовалось для группировки), и "Продажа" теперь показывается
            явной строкой "нет объявлений", а не пропадает из виду, если
            сейчас пусто. */}
        {offers !== null && (
          <div className={cn('mt-6 flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="text-lg font-bold text-ink">Рынок в этом здании</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    <th scope="col" className="py-2 pr-3 text-left">
                      Тип помещения
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      Объявлений
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      Площадь
                    </th>
                    <th scope="col" className="py-2 pl-2 text-right">
                      Цена за м²
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <OfferDealSection title="Продажа" rows={saleRows} isFirst />
                  <OfferDealSection title="Аренда" rows={rentRows} />
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-faint">
              Считается автоматически по объявлениям с Kufar и Realt.by, найденным по адресу здания — данные обновляются
              ежемесячно, без ручной проверки каждой строки.
            </p>
          </div>
        )}

        {/* Условия для арендаторов с офиц. сайта БЦ (владелец, 2026-09-05,
            на примере "Проспект"/Elite Estate — по нему нет объявлений на
            Kufar/Realt, но на собственном сайте есть условия для
            арендаторов: "пройдись по сайтам БЦ и поищешь такую информацию").
            Собрано веб-поиском (Gemini через ProxyAPI — прямого доступа к
            большинству сайтов БЦ из песочницы нет), текст свободной формы —
            ставки/сроки/что включено/парковка/контакты отдела аренды, где
            что-то не удалось найти или сайт был недоступен — честно так и
            написано в самом тексте, не приукрашено. null — сайта нет,
            недоступен был при проверке, или на нём вообще нет такой
            информации (например "Аден" — по факту гостиница, не БЦ). */}
        {center.rentalInfo && (
          <div className={cn('mt-6 flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <FileText className="h-5 w-5 shrink-0 text-primary" />
              Условия для арендаторов
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{center.rentalInfo}</p>
            <p className="text-xs text-ink-faint">
              Собрано автоматически по официальному сайту БЦ и открытым источникам — не куратировано вручную, перед
              подписанием договора уточняйте актуальные условия напрямую у арендодателя.
            </p>
          </div>
        )}

        {/* Мобильная навигация "следующий/предыдущий" — фиксированные стрелки
            выше скрыты до lg, здесь тот же переход обычной строкой кнопок. */}
        {(prev || next) && (
          <div className="mt-5 flex items-center justify-between gap-3 lg:hidden">
            {prev ? (
              <Link
                to={`/minsk/bcminsk/${prev.slug}`}
                className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" />
                {shortName(prev)}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                to={`/minsk/bcminsk/${next.slug}`}
                className="flex items-center gap-1.5 text-right text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
              >
                {shortName(next)}
                <ChevronRight className="h-4 w-4 shrink-0" />
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Одна строка таблицы — либо реальная разбивка по типу помещения (для
// сделки, где объявления есть), либо единственная строка-заглушка "нет
// объявлений" (propertyType: null), когда по этой сделке сейчас пусто —
// владелец: "Продажа" должна быть видна явной строкой, а не пропадать.
interface OfferRow {
  propertyType: string | null;
  count: number;
  minSize: number;
  maxSize: number;
  minPrice: number;
  medianPrice: number;
  maxPrice: number;
}

function computeOfferRows(offers: BusinessCenterOffer[], dealType: BusinessCenterOffer['dealType']): OfferRow[] {
  const filtered = offers.filter((o) => o.dealType === dealType);
  if (filtered.length === 0) {
    return [{ propertyType: null, count: 0, minSize: 0, maxSize: 0, minPrice: 0, medianPrice: 0, maxPrice: 0 }];
  }

  const groups = new Map<string, BusinessCenterOffer[]>();
  for (const o of filtered) {
    const key = o.propertyType ?? 'Без категории';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }

  return Array.from(groups.entries())
    .map(([propertyType, group]) => {
      const sizes = group.map((o) => o.size);
      const prices = [...group.map((o) => o.pricePerSqm)].sort((a, b) => a - b);
      const mid = Math.floor(prices.length / 2);
      const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
      return {
        propertyType,
        count: group.length,
        minSize: Math.min(...sizes),
        maxSize: Math.max(...sizes),
        minPrice: Math.min(...prices),
        medianPrice,
        maxPrice: Math.max(...prices),
      };
    })
    .sort((a, b) => b.count - a.count);
}

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('ru-RU')}`;
}

// Заголовок сделки (Продажа/Аренда) — не отдельная колонка (чтобы не
// повторять текст на каждой строке разбивки), а строка-разделитель на всю
// ширину таблицы, за ней сразу строки по типу помещения.
function OfferDealSection({ title, rows, isFirst }: { title: string; rows: OfferRow[]; isFirst?: boolean }) {
  return (
    <>
      <tr>
        <td colSpan={4} className={cn('pb-1 text-xs font-bold uppercase tracking-wide text-ink-faint', isFirst ? 'pt-0' : 'pt-3')}>
          {title}
        </td>
      </tr>
      {rows.map((row) =>
        row.propertyType === null ? (
          <tr key="empty">
            <td colSpan={4} className="py-2 text-ink-faint">
              Нет активных объявлений
            </td>
          </tr>
        ) : (
          <tr key={row.propertyType}>
            <td className="py-2 pr-3 font-medium text-ink">{row.propertyType}</td>
            <td className="py-2 px-2 text-right tabular-nums text-ink-faint">{row.count}</td>
            <td className="whitespace-nowrap py-2 px-2 text-right tabular-nums text-ink-faint">
              {row.minSize === row.maxSize
                ? `${row.minSize.toLocaleString('ru-RU')} м²`
                : `${row.minSize.toLocaleString('ru-RU')}–${row.maxSize.toLocaleString('ru-RU')} м²`}
            </td>
            <td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums font-semibold text-ink">
              {row.minPrice === row.maxPrice
                ? `${formatUsd(row.minPrice)}/м²`
                : `${formatUsd(row.minPrice)}–${formatUsd(row.maxPrice)}/м² (медиана ${formatUsd(row.medianPrice)})`}
            </td>
          </tr>
        ),
      )}
    </>
  );
}
