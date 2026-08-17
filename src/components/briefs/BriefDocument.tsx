import { useState } from 'react';
import {
  briefPhotoCategories,
  briefPhotoCategoryLabels,
  FACADE_REFERENCE_CAPTION,
  PLAN_REQUEST_NOTE,
  type Brief,
  type PhotoPin,
} from '../../data/briefs';
import type { BuildingSpecs, RealtyObject } from '../../data/objects';
import { BriefBuildingPlans } from './BriefBuildingPlans';
import { PinnedPhotoCarousel } from './PinnedPhotoCarousel';
import { PhotoLightbox } from './PhotoLightbox';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';

// Не все поля техпаспорта — сметчику по ремонту важен конструктив и
// инженерка, а не, например, количество кабинетов/санузлов.
const specsFields: { key: keyof BuildingSpecs; label: string }[] = [
  { key: 'buildingPurpose', label: 'Назначение здания' },
  { key: 'yearBuilt', label: 'Год постройки' },
  { key: 'yearRenovated', label: 'Год последнего ремонта' },
  { key: 'floorsCount', label: 'Этажность' },
  { key: 'totalArea', label: 'Общая площадь, м²' },
  { key: 'foundation', label: 'Фундамент' },
  { key: 'walls', label: 'Стены' },
  { key: 'ceilings', label: 'Перекрытия' },
  { key: 'structure', label: 'Конструктив' },
  { key: 'roof', label: 'Кровля' },
  { key: 'flooring', label: 'Полы' },
  { key: 'windows', label: 'Окна' },
  { key: 'electricity', label: 'Электрика' },
  { key: 'water', label: 'Водоснабжение' },
  { key: 'sewerage', label: 'Канализация' },
  { key: 'heating', label: 'Отопление' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="break-words text-sm text-ink">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-4 p-5', glassCardClass)} style={glassCardShadow}>
      <span className="text-lg font-bold text-ink">{title}</span>
      {children}
    </div>
  );
}

// Сама вёрстка документа — вынесена из BriefPublicPage.tsx отдельно от
// загрузки данных по токену, чтобы её можно было прогнать с моковыми
// данными при проверке вёрстки, не поднимая реальный Supabase.
export function BriefDocument({ brief, object }: { brief: Brief; object: RealtyObject }) {
  // Один стейт лайтбокса на весь документ — открывается кликом по любой
  // миниатюре (планировка, фото "до" со своими точками, референс "после")
  // вместо перехода в новую вкладку. pins присутствует только для фото
  // "сейчас" — определяется в месте открытия, не угадывается по контенту
  // (у фото без единой точки pins[url] был бы undefined и его нельзя
  // отличить от обычного фото без разметки).
  const [lightbox, setLightbox] = useState<{ url: string; pins?: PhotoPin[] } | null>(null);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <span className="text-lg font-extrabold tracking-wide text-ink">
          <span className="font-black text-primary">RED</span>EVELOPMENT
        </span>
      </div>

      <div
        className={cn('flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between', glassCardClass)}
        style={glassCardShadow}
      >
        <div className="flex flex-col gap-1">
          <span className="text-base font-semibold text-ink sm:text-lg">
            Техническое задание на предварительный просчёт сметы реновации здания
          </span>
          <span className="text-xl font-bold text-ink sm:text-2xl">{object.name || object.address}</span>
          {object.name && <span className="text-sm text-ink-faint">{object.address}</span>}
        </div>
        {(brief.recipientName || brief.recipientPhone) && (
          <div className="flex flex-col gap-0.5 sm:w-56 sm:shrink-0 sm:items-end sm:text-right">
            <span className="text-xs uppercase tracking-wide text-ink-faint">Кому направлено</span>
            {brief.recipientName && <span className="text-sm font-semibold text-ink">{brief.recipientName}</span>}
            {brief.recipientPhone && <span className="text-sm text-ink-muted">{brief.recipientPhone}</span>}
          </div>
        )}
      </div>

      {object.buildingSpecs && (
        <Section title="Технический паспорт здания">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {specsFields.map(({ key, label }) => {
              const value = object.buildingSpecs![key];
              if (value === null || value === '' || value === undefined) return null;
              return (
                <Field key={key} label={label}>
                  {String(value)}
                </Field>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Планировки">
        <p className="text-sm text-ink-muted">{PLAN_REQUEST_NOTE}</p>
        <BriefBuildingPlans object={object} />
      </Section>

      {briefPhotoCategories.map((category) => {
        const cat = brief.photos[category];
        return (
          <Section key={category} title={briefPhotoCategoryLabels[category]}>
            <div className="flex flex-col gap-3">
              <span className="text-xs uppercase tracking-wide text-ink-faint">Сейчас — что менять</span>
              <PinnedPhotoCarousel
                photos={cat.beforeUrls.map((url) => ({ url, pins: cat.pins[url] ?? [] }))}
                onOpenPhoto={(url, pins) => setLightbox({ url, pins })}
              />
            </div>

            {cat.beforeUrls.length > 0 && cat.afterUrls.length > 0 && (
              <p className="text-xs text-ink-faint">↓ Отмеченные точками изменения приводят к результату ниже</p>
            )}

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <span className="text-xs uppercase tracking-wide text-ink-faint">Должно стать (референс)</span>
              <PinnedPhotoCarousel
                photos={cat.afterUrls.map((url) => ({ url, pins: cat.pins[url] ?? [] }))}
                onOpenPhoto={(url, pins) => setLightbox({ url, pins })}
                emptyLabel="Фото не загружены"
                overlayCaption={category === 'facade' ? FACADE_REFERENCE_CAPTION : undefined}
              />
            </div>
          </Section>
        );
      })}

      <PhotoLightbox url={lightbox?.url ?? null} pins={lightbox?.pins} onClose={() => setLightbox(null)} />
    </div>
  );
}
