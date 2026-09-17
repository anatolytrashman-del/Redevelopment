import { useEffect, useState, type ReactNode } from 'react';
import { Camera, ChevronLeft, ChevronRight, ExternalLink, HardHat } from 'lucide-react';
import type { BusinessCenter } from '../../data/businessCenters';
import { businessCenterPhotoSrc } from '../../lib/businessCenterDisplay';

// Общие мелкие визуальные блоки БЦ — используются и на хабе
// (BusinessCentersMinskPage.tsx, компактная карточка), и на отдельной
// странице конкретного БЦ (BusinessCenterDetailPage.tsx, крупное фото) —
// вынесены сюда, чтобы не дублировать (тот же принцип, что и у
// lib/businessCenterDisplay.ts рядом).
// PAGESPEED_PLAN.md, Э9 — variant выбирает WebP-версию фото под место
// показа (см. businessCenterPhotoSrc): 'card' — карточка каталога, ленивая
// (143 карточки, грузятся по мере скролла); 'detail' — главное фото
// страницы БЦ, это её LCP-элемент: eager + fetchpriority="high" (раньше
// стояло loading="lazy", и PageSpeed прямо ругался "LCP resources should
// not use loading=lazy", LCP 4,5с). width/height — под соотношение
// контейнера (16:10 у карточки, 16:9 у страницы). По умолчанию фото
// заполняет контейнер через object-cover; fit='contain' сохраняет весь кадр
// в компактной главной карточке. Значения нужны браузеру для CLS, это не
// реальный размер файла.
interface CuratedBusinessCenterPhoto {
  src: string;
  alt: string;
  sourceLabel: string;
  sourceHref: string;
}

// Проверенная вручную фотоподборка для зданий, которым одного снимка из
// каталога недостаточно. Карта намеренно живёт рядом с PhotoBlock: так один
// и тот же первый кадр используется в каталоге, а полная галерея — только на
// странице БЦ. Новые здания можно добавлять сюда партиями, не меняя данные БД.
const CURATED_BUSINESS_CENTER_PHOTOS: Record<string, readonly CuratedBusinessCenterPhoto[]> = {
  port: [
    {
      src: '/images/business-centers/port-gallery-1.jpg',
      alt: 'Бизнес-центр «Порт» на проспекте Независимости, 177',
      sourceLabel: 'A1 Девелопмент',
      sourceHref: 'https://a1development.by/',
    },
    {
      src: '/images/business-centers/port-gallery-2.jpg',
      alt: 'Вход во вторую секцию бизнес-центра «Порт»',
      sourceLabel: 'Яндекс.Карты',
      sourceHref: 'https://yandex.by/maps/org/port/1404854623/gallery/',
    },
    {
      src: '/images/business-centers/port-gallery-3.jpg',
      alt: 'Главный фасад бизнес-центра «Порт»',
      sourceLabel: 'Яндекс.Карты',
      sourceHref: 'https://yandex.by/maps/org/port/1404854623/gallery/',
    },
    {
      src: '/images/business-centers/port-gallery-4.jpg',
      alt: 'Боковой фасад бизнес-центра «Порт»',
      sourceLabel: 'Яндекс.Карты',
      sourceHref: 'https://yandex.by/maps/org/port/1404854623/gallery/',
    },
  ],
};

export function PhotoBlock({
  center,
  variant,
  fit = 'cover',
}: {
  center: BusinessCenter;
  variant: 'card' | 'detail';
  fit?: 'cover' | 'contain';
}) {
  const detail = variant === 'detail';
  const curatedPhotos = CURATED_BUSINESS_CENTER_PHOTOS[center.slug];
  const fallbackPhoto = center.photos[0]
    ? {
        src: businessCenterPhotoSrc(center.photos[0], variant),
        alt: center.name,
        sourceLabel: '',
        sourceHref: '',
      }
    : null;
  const photos = curatedPhotos ?? (fallbackPhoto ? [fallbackPhoto] : []);
  const [displayedIndex, setDisplayedIndex] = useState(0);

  useEffect(() => {
    setDisplayedIndex(0);
  }, [center.slug, variant]);

  const showPhoto = (nextIndex: number) => {
    if (photos.length < 2) return;
    const normalizedIndex = (nextIndex + photos.length) % photos.length;
    const preload = new Image();
    preload.onload = () => setDisplayedIndex(normalizedIndex);
    preload.src = photos[normalizedIndex].src;
    if (preload.complete) setDisplayedIndex(normalizedIndex);
  };

  if (photos.length > 0) {
    const activePhoto = photos[Math.min(displayedIndex, photos.length - 1)];
    const carousel = detail && photos.length > 1;

    return (
      <div className="relative h-full w-full overflow-hidden">
        <img
          key={activePhoto.src}
          src={activePhoto.src}
          alt={activePhoto.alt}
          className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
          loading={detail ? 'eager' : 'lazy'}
          fetchPriority={detail ? 'high' : 'auto'}
          width={detail ? 1200 : 640}
          height={detail ? 675 : 400}
        />
        {carousel && (
          <>
            <button
              type="button"
              onClick={() => showPhoto(displayedIndex - 1)}
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-card transition hover:bg-white"
              aria-label="Предыдущее фото"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => showPhoto(displayedIndex + 1)}
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-card transition hover:bg-white"
              aria-label="Следующее фото"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              <span>{displayedIndex + 1} / {photos.length}</span>
              <span className="flex gap-1" aria-hidden="true">
                {photos.map((photo, index) => (
                  <span
                    key={photo.src}
                    className={`h-1.5 rounded-full transition-all ${index === displayedIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/55'}`}
                  />
                ))}
              </span>
            </div>
            {activePhoto.sourceHref && (
              <a
                href={activePhoto.sourceHref}
                target="_blank"
                rel="noreferrer"
                className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/80"
              >
                Фото: {activePhoto.sourceLabel}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </>
        )}
      </div>
    );
  }
  // Фото ещё нет — владелец добавит сам (см. комментарий в data-файле).
  // Тот же визуальный приём, что у карточки "ещё не построен" в Залогах
  // (Objects.tsx) — заливка градиентом вместо пустого места; для строящихся
  // объектов бейдж говорит про стройку, а не про "фото скоро появятся".
  if (center.status === 'under_construction') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-muted to-border">
        <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink shadow-sm">
          <HardHat className="h-3.5 w-3.5 shrink-0" />
          {center.yearBuilt ? `Строится · сдача в ${center.yearBuilt} г.` : 'Строится'}
        </span>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-muted to-border">
      <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink-muted shadow-sm">
        <Camera className="h-3.5 w-3.5 shrink-0" />
        Фото скоро
      </span>
    </div>
  );
}

export function FactRow({ icon: Icon, children }: { icon: typeof Camera; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-ink-muted">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
      <span>{children}</span>
    </div>
  );
}

// Плитка факта — тот же визуальный язык, что и у "Ключевых цифр" на гиде
// района Минск Мир (DistrictGuidePage.tsx: круглая иконка + крупное значение
// + подпись, белая карточка на фоне glass-карточки). Владелец, 2026-09-06:
// "переработай блок фактов в плиточки, можно разного размера... пример бери
// с минск мира". Два режима контента:
// - "stat" (по умолчанию) — крупное жирное значение + мелкая серая подпись,
//   для коротких числовых фактов (площадь/год/этажи/метро после разбивки).
// - "text" — обычный текст без крупного значения, для факта, который не
//   раскладывается на "число + подпись" (парковка, застройщик) — те же
//   карточка/иконка, просто без искусственного разделения на две строки.
// span — растягивает плитку на несколько колонок сетки (владелец,
// 2026-09-06, второй заход, увидев паркинг на пол-ширины: "растяни на 3
// карточки" — на сетке grid-cols-2 sm:grid-cols-4 это col-span-2 на мобиле
// (там и так вся ширина — 2 колонки) и sm:col-span-3 от sm и выше).
const SPAN_CLASSES: Record<number, string> = {
  2: 'col-span-2',
  3: 'col-span-2 sm:col-span-3',
  4: 'col-span-2 sm:col-span-4',
};

export function FactTile({
  icon: Icon,
  value,
  label,
  text,
  span,
  tone = 'default',
}: {
  icon: typeof Camera;
  value?: ReactNode;
  label?: ReactNode;
  text?: ReactNode;
  span?: 2 | 3 | 4;
  tone?: 'default' | 'muted';
}) {
  const muted = tone === 'muted';
  return (
    <div
      className={
        (muted
          ? 'flex flex-col gap-1.5 rounded-control border border-border/70 bg-surface-muted/70 p-3'
          : 'flex flex-col gap-2 rounded-control border border-border/60 bg-white p-4 shadow-card') +
        (span ? ` ${SPAN_CLASSES[span]}` : '')
      }
    >
      <span
        className={
          'flex shrink-0 items-center justify-center rounded-full ' +
          (muted ? 'h-8 w-8 bg-white/70 text-ink-muted' : 'h-9 w-9 bg-surface-muted text-ink')
        }
      >
        <Icon className="h-4 w-4" />
      </span>
      {text ? (
        <p className="text-sm font-semibold leading-snug text-ink">{text}</p>
      ) : (
        <>
          <div className={muted ? 'text-base font-bold leading-tight text-ink' : 'text-lg font-extrabold leading-tight text-ink'}>
            {value}
          </div>
          {label && <p className="text-xs leading-snug text-ink-muted">{label}</p>}
        </>
      )}
    </div>
  );
}
