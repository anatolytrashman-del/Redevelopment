import { useState } from 'react';
import {
  AFTER_BLOCK_TITLE,
  BEFORE_BLOCK_TITLE,
  briefPhotoCategories,
  briefPhotoCategoryLabels,
  COST_REDUCTION_IDEAS,
  COST_REDUCTION_IDEAS_TITLE,
  FACADE_REFERENCE_CAPTION,
  PLAN_REQUEST_NOTE,
  type Brief,
  type BriefPhotoCategory,
  type PhotoChange,
  type PhotoMarker,
} from '../../data/briefs';
import type { BuildingSpecs, RealtyObject } from '../../data/objects';
import { BriefBuildingPlans } from './BriefBuildingPlans';
import { PinnedPhotos } from './PinnedPhotos';
import { PhotoLightbox } from './PhotoLightbox';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';

// Где фото ("сейчас" и "должно стать") показываем списком друг под другом,
// а не слайдером. Общие зоны — это разные помещения (холл, лестница,
// санузел), а не разные ракурсы одного: пролистывать их по одному, чтобы
// увидеть весь объём работ, неудобно. У фасада и кабинетов кадры
// однотипные, там слайдер компактнее.
const stackedCategories: BriefPhotoCategory[] = ['commonAreas'];

// Не все поля техпаспорта — сметчику по ремонту важен конструктив и
// инженерка, а не, например, количество кабинетов/санузлов.
const specsFields: { key: keyof BuildingSpecs; label: string }[] = [
  { key: 'buildingPurpose', label: 'Назначение здания' },
  { key: 'yearBuilt', label: 'Год постройки' },
  { key: 'yearRenovated', label: 'Год последнего ремонта' },
  { key: 'floorsCount', label: 'Этажность' },
  { key: 'totalArea', label: 'Общая площадь, м²' },
  { key: 'normativeArea', label: 'Нормативная площадь, м²' },
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

// Заголовок секции подняли вслед за заголовками блоков внутри неё
// (BEFORE_BLOCK_TITLE/AFTER_BLOCK_TITLE) — иначе название категории
// оказалось бы мельче вложенного в неё блока.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-4 p-5', glassCardClass)} style={glassCardShadow}>
      <span className="text-xl font-bold text-ink sm:text-2xl">{title}</span>
      {children}
    </div>
  );
}

// Сама вёрстка документа — вынесена из BriefPublicPage.tsx отдельно от
// загрузки данных по токену, чтобы её можно было прогнать с моковыми
// данными при проверке вёрстки, не поднимая реальный Supabase.
export function BriefDocument({ brief, object }: { brief: Brief; object: RealtyObject }) {
  // Один стейт лайтбокса на весь документ — открывается кликом по любой
  // миниатюре (планировка, фото "до"/"после" со своими метками) вместо
  // перехода в новую вкладку. markers/changes передаются только для фото
  // категории — определяются в месте открытия, не угадываются по контенту.
  const [lightbox, setLightbox] = useState<{
    url: string;
    markers?: PhotoMarker[];
    changes?: PhotoChange[];
    link?: string;
  } | null>(null);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <span className="text-lg font-extrabold tracking-wide text-ink">
          <span className="font-black text-primary">RED</span>EVELOPMENT
        </span>
      </div>

      <div
        className={cn('flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between', glassCardClass)}
        style={glassCardShadow}
      >
        <div className="flex flex-col gap-1">
          <span className="text-base font-semibold text-ink sm:text-lg">
            Техническое задание на предварительный просчёт ведомостей объема работ и материалов для реновации здания
          </span>
          {/* Название объекта (RealtyObject.name) сюда намеренно не выводится
              — оно маркетинговое ("Minsk One" и т.п.), сметчику нужен только
              реальный адрес. */}
          <span className="text-xl font-bold text-ink sm:text-2xl">{object.address}</span>
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
        const changesById: Record<string, PhotoChange> = {};
        for (const c of cat.changes) changesById[c.id] = c;
        return (
          <Section key={category} title={briefPhotoCategoryLabels[category]}>
            <div className="flex flex-col gap-3">
              <span className="text-lg font-bold text-ink sm:text-xl">{BEFORE_BLOCK_TITLE}</span>
              <PinnedPhotos
                photos={cat.beforeUrls.map((url) => ({ url, markers: cat.markers[url] ?? [], link: cat.photoLinks[url] }))}
                changesById={changesById}
                onOpenPhoto={(url, markers) =>
                  setLightbox({ url, markers, changes: cat.changes, link: cat.photoLinks[url] })
                }
                layout={stackedCategories.includes(category) ? 'stack' : 'carousel'}
              />
            </div>

            {cat.beforeUrls.length > 0 && cat.afterUrls.length > 0 && (
              <p className="text-xs text-ink-faint">↓ Отмеченные точками изменения приводят к результату ниже</p>
            )}

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <span className="text-lg font-bold text-ink sm:text-xl">{AFTER_BLOCK_TITLE}</span>
              <PinnedPhotos
                photos={cat.afterUrls.map((url) => ({ url, markers: cat.markers[url] ?? [], link: cat.photoLinks[url] }))}
                changesById={changesById}
                onOpenPhoto={(url, markers) =>
                  setLightbox({ url, markers, changes: cat.changes, link: cat.photoLinks[url] })
                }
                emptyLabel="Фото не загружены"
                overlayCaption={category === 'facade' ? FACADE_REFERENCE_CAPTION : undefined}
                layout={stackedCategories.includes(category) ? 'stack' : 'carousel'}
              />
            </div>
          </Section>
        );
      })}

      <Section title={COST_REDUCTION_IDEAS_TITLE}>
        <ol className="flex flex-col gap-2">
          {COST_REDUCTION_IDEAS.map((idea, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink">
              <span className="shrink-0 font-semibold text-ink-muted">{i + 1}.</span>
              <span>{idea}</span>
            </li>
          ))}
        </ol>
      </Section>

      <PhotoLightbox
        url={lightbox?.url ?? null}
        markers={lightbox?.markers}
        changes={lightbox?.changes}
        photoLink={lightbox?.link}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
