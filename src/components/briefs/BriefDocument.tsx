import type { Brief } from '../../data/briefs';
import type { BuildingSpecs, RealtyObject } from '../../data/objects';
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

function PhotoGrid({ urls, emptyLabel }: { urls: string[]; emptyLabel: string }) {
  if (urls.length === 0) return <p className="text-sm text-ink-faint">{emptyLabel}</p>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {urls.map((url) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block aspect-[4/3] overflow-hidden rounded-control bg-surface-muted"
        >
          <img src={url} alt="" className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );
}

// Сама вёрстка документа — вынесена из BriefPublicPage.tsx отдельно от
// загрузки данных по токену, чтобы её можно было прогнать с моковыми
// данными при проверке вёрстки, не поднимая реальный Supabase.
export function BriefDocument({ brief, object }: { brief: Brief; object: RealtyObject }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <span className="text-lg font-extrabold tracking-wide text-ink">
          <span className="font-black text-primary">RED</span>EVELOPMENT
        </span>
      </div>

      <div className={cn('flex flex-col gap-1 p-5', glassCardClass)} style={glassCardShadow}>
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Техническое задание на просчёт сметы ремонта
        </span>
        <span className="text-2xl font-bold text-ink">{object.name || object.address}</span>
        {object.name && <span className="text-sm text-ink-muted">{object.address}</span>}
        {object.area > 0 && <span className="text-sm text-ink-muted">Площадь: {object.area} м²</span>}
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

      {object.floorPlanUrls.length > 0 && (
        <Section title="Планировки">
          <PhotoGrid urls={object.floorPlanUrls} emptyLabel="Планировки не загружены" />
        </Section>
      )}

      <Section title="Фото «до»">
        <PhotoGrid urls={brief.beforePhotoUrls} emptyLabel="Фото не загружены" />
      </Section>

      <Section title="Фото «после» (референс)">
        <PhotoGrid urls={brief.afterPhotoUrls} emptyLabel="Фото не загружены" />
      </Section>

      <Section title="Планируемые изменения — внутри помещений">
        <p className="whitespace-pre-wrap text-sm text-ink">{brief.interiorChanges || '—'}</p>
      </Section>

      <Section title="Планируемые изменения — фасад">
        <p className="whitespace-pre-wrap text-sm text-ink">{brief.facadeChanges || '—'}</p>
      </Section>
    </div>
  );
}
