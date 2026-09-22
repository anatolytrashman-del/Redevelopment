import type { ReactNode } from 'react';
import { Camera, HardHat } from 'lucide-react';
import type { BusinessCenter } from '../../data/businessCenters';
import {
  BC_CARD_PHOTO_SIZES,
  businessCenterCardPhotoSrcSet,
  businessCenterPhotoSrc,
} from '../../lib/businessCenterDisplay';

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
  // Ручные снимки лежат одним файлом, уменьшенных копий у них нет.
  srcSet?: string;
}

// Проверенное вручную фото для здания, у которого снимок из каталога не
// подходит главной карточке. Карта живёт рядом с PhotoBlock, чтобы один и
// тот же кадр использовался и в каталоге, и на отдельной странице БЦ.
const CURATED_BUSINESS_CENTER_PHOTOS: Record<string, CuratedBusinessCenterPhoto> = {
  port: {
    src: '/images/business-centers/port-photo.jpg',
    alt: 'Бизнес-центр «Порт» на проспекте Независимости, 177',
  },
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
  const curatedPhoto = CURATED_BUSINESS_CENTER_PHOTOS[center.slug];
  const fallbackPhoto = center.photos[0]
    ? {
        src: businessCenterPhotoSrc(center.photos[0], variant),
        alt: center.name,
        // Уменьшенные копии есть только у карточного варианта наших
        // закоммиченных фото (см. businessCenterCardPhotoSrcSet).
        srcSet: detail ? undefined : businessCenterCardPhotoSrcSet(center.photos[0]),
      }
    : null;
  const photo = curatedPhoto ?? fallbackPhoto;

  if (photo) {
    return (
      <img
        src={photo.src}
        srcSet={photo.srcSet}
        sizes={photo.srcSet ? BC_CARD_PHOTO_SIZES : undefined}
        alt={photo.alt}
        className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
        loading={detail ? 'eager' : 'lazy'}
        fetchPriority={detail ? 'high' : 'auto'}
        width={detail ? 1200 : 640}
        height={detail ? 675 : 400}
      />
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
    <div className="flex items-center gap-2 text-xs text-ink-muted">
      <Icon className="h-4 w-4 shrink-0 text-ink-faint" />
      <span className="text-balance">{children}</span>
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
  icon?: typeof Camera;
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
      {Icon && (
        <span
          className={
            'flex shrink-0 items-center justify-center rounded-full ' +
            (muted ? 'h-8 w-8 bg-white/70 text-ink-muted' : 'h-9 w-9 bg-surface-muted text-ink')
          }
        >
          <Icon className="h-4 w-4" />
        </span>
      )}
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
