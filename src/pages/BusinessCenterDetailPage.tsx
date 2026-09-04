import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2, Calendar, Car, ChevronLeft, ChevronRight, Globe, Layers, MapPin, Ruler, TrainFront, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow, glassPillClass, glassPillShadow } from '../lib/glass';
import { Badge } from '../components/ui/Badge';
import { PhotoBlock, FactRow } from '../components/businessCenters/BusinessCenterVisuals';
import { setBreadcrumbJsonLd, setNoIndex, clearNoIndex, setBusinessCenterPageMeta } from '../lib/pageMeta';
import { businessClassTone, shortName, sortByShortName } from '../lib/businessCenterDisplay';
import type { BusinessCenter } from '../data/businessCenters';
import { fetchBusinessCenters } from '../lib/businessCentersApi';

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

  useEffect(() => {
    fetchBusinessCenters()
      .then(setCenters)
      .catch(() => setCenters([]));
  }, []);

  // Порядок для "предыдущий/следующий" — тот же алфавит по короткому имени,
  // что и в боковом меню хаба, чтобы стрелки совпадали с порядком, который
  // пользователь уже видел в списке до перехода сюда.
  const sorted = useMemo(() => sortByShortName(centers ?? []), [centers]);
  const center = useMemo(() => sorted.find((c) => c.slug === slug) ?? null, [sorted, slug]);
  const index = center ? sorted.findIndex((c) => c.slug === center.slug) : -1;
  const prev = index > 0 ? sorted[index - 1] : null;
  const next = index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : null;

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
