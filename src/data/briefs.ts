// Техзадание для инженера, который считает смету ремонта — привязано к
// существующему объекту (RealtyObject), переиспользует его технический
// паспорт (BuildingSpecs) и интерактивные планировки (buildingPlanIds — тот
// же зумируемый план с этажами и кабинетами, что видит клиент на продающей
// странице и админ в карточке объекта, см. BriefBuildingPlans.tsx).
// Публикуется по share_token на /tz/:token — сам документ не требует пароля
// админки, его смотрит внешний инженер.

// Три вида, по которым разложены фото "до"/"после" — у здания и кабинетов, и
// общих зон, и фасада разная логика ремонта, инженеру удобнее смотреть их
// не одной кучей.
export const briefPhotoCategories = ['facade', 'offices', 'commonAreas'] as const;
export type BriefPhotoCategory = (typeof briefPhotoCategories)[number];

export const briefPhotoCategoryLabels: Record<BriefPhotoCategory, string> = {
  facade: 'Фасад',
  offices: 'Кабинеты',
  commonAreas: 'Общие зоны',
};

// Референс фасада — обычно AI-рендер, не фото реального объекта: подпись
// поверх фото, чтобы сметчик не принял его за фотографию готового здания.
export const FACADE_REFERENCE_CAPTION = 'Примерный дизайн, созданный искусственным интеллектом согласно ТЗ';

// Строка над блоком планировок — план объекта в базе не всегда чертёжного
// качества (со размерами), а для сметы это важно. Просто напоминание
// сметчику, что точный техплан заказан у собственника отдельно, а
// показанная ниже планировка — рабочий вариант для ориентира.
export const PLAN_REQUEST_NOTE = 'Запрошен техплан у собственника с планировками и размерами в хорошем разрешении';

// Правка — описание изменения ("покрасить стены", "заменить пол") заводится
// ОДИН раз на категорию и переиспользуется на любом числе фото "до"/"после":
// текст/референс живут здесь, а не на каждой отметке отдельно. Раньше у
// каждой точки на каждом фото был свой независимый комментарий — при похожей
// правке на втором фото приходилось либо печатать текст заново, либо вручную
// "копировать" точки специальной кнопкой, что было неочевидно и не спасало,
// если правку правили уже после копирования (правки расходились). Теперь
// правка одна, а точки на разных фото — просто её метки-координаты.
export interface PhotoChange {
  id: string;
  comment: string;
  // Референс на конкретную модель/товар ("вот такую именно дверь
  // поставить") — необязательный, отдельно от текстового комментария.
  // На публичной странице не показывается сразу картинкой (загораживала
  // фото), а скрыт за ссылкой "Референс" — см. ReferencePopup.tsx.
  referenceImageUrl: string;
  referenceDescription: string;
  referenceUrl: string;
}

export function changeHasReference(
  change: Pick<PhotoChange, 'referenceImageUrl' | 'referenceDescription' | 'referenceUrl'>,
): boolean {
  return !!(change.referenceImageUrl || change.referenceDescription || change.referenceUrl);
}

// Метка правки на конкретном фото — x/y в процентах от размера фото (не в
// пикселях: тогда отметка съезжала бы при показе фото в другом размере,
// например в модалке редактирования и на публичной странице). Все контейнеры,
// где фото с метками показывается в реальном размере (не миниатюра без
// разметки), обязаны использовать один и тот же aspect-[16/9] — иначе
// object-cover кадрирует фото по-разному и точки визуально съезжают
// (см. AnnotatedPhoto.tsx/PinnedPhotos.tsx). Текста внутри нет —
// только ссылка на PhotoChange, координаты у каждого фото свои (одна и та же
// правка может быть в разных местах кадра на разных фото).
export interface PhotoMarker {
  id: string;
  changeId: string;
  x: number;
  y: number;
}

export interface BriefCategoryPhotos {
  beforeUrls: string[];
  afterUrls: string[];
  // Общий список правок категории — общий для всех фото "до" и "после"
  // внутри неё.
  changes: PhotoChange[];
  // Метки — ключ: url фото (не индекс в массиве: индекс сползает при
  // удалении фото, а url общий для beforeUrls/afterUrls). Список меток
  // показывается сбоку от фото, пронумерован в тон меткам на самом фото.
  markers: Record<string, PhotoMarker[]>;
}

export type BriefPhotos = Record<BriefPhotoCategory, BriefCategoryPhotos>;

export function emptyCategoryPhotos(): BriefCategoryPhotos {
  return { beforeUrls: [], afterUrls: [], changes: [], markers: {} };
}

export function emptyBriefPhotos(): BriefPhotos {
  return {
    facade: emptyCategoryPhotos(),
    offices: emptyCategoryPhotos(),
    commonAreas: emptyCategoryPhotos(),
  };
}

export function changeIsEmpty(change: PhotoChange): boolean {
  return !change.comment.trim() && !changeHasReference(change);
}

// Выбрасывает правки, на которые не ссылается ни одна метка И у которых нет
// вообще никакого содержимого. Такие копятся сами собой: клик "Новая правка"
// заводит пустую правку сразу, ещё до того, как что-то напечатали, — и если
// потом снять метку (или передумать), пустышка навсегда осталась бы в списке
// выбора "та же правка или новая". Правку с текстом, но без меток, наоборот
// оставляем — её можно осмысленно отметить на другом фото.
export function pruneEmptyOrphanChanges(c: BriefCategoryPhotos): BriefCategoryPhotos {
  const used = new Set<string>();
  for (const list of Object.values(c.markers)) {
    for (const m of list ?? []) used.add(m.changeId);
  }
  const changes = c.changes.filter((ch) => used.has(ch.id) || !changeIsEmpty(ch));
  return changes.length === c.changes.length ? c : { ...c, changes };
}

// Достраивает недостающие категории/поля до полной структуры — приходит
// из безопасности из БД: старые строки (созданные до того, как появилось
// это поле) получили photos = {} от значения по умолчанию колонки, без
// ключей facade/offices/commonAreas внутри. raw?.[category] ?? emptyCategoryPhotos()
// такое не ловит, потому что {} — не null/undefined.
//
// Отдельно мигрирует старый формат (до общих правок — каждая точка со своим
// comment/referenceUrl, ключ pins вместо changes/markers). Старые точки с
// ПОЛНОСТЬЮ совпадающим содержимым схлопываются в одну общую правку: раньше
// одну и ту же правку размножали копированием на каждое фото, и без
// схлопывания список выбора распухал до десятков дублей (в т.ч. пачки
// пустых "Без описания" от точек, которым так и не написали текст).
// Совпадение проверяем по всем полям сразу, а не только по тексту — тогда
// объединение заведомо безопасно: одинаковое содержимое и есть одно и то же.
export function normalizeBriefPhotos(raw: unknown): BriefPhotos {
  const result = {} as BriefPhotos;
  for (const category of briefPhotoCategories) {
    const c = (raw as Record<string, unknown> | null | undefined)?.[category] as
      | (Partial<BriefCategoryPhotos> & { pins?: Record<string, LegacyPhotoPin[]> })
      | undefined;

    if (c?.changes || c?.markers) {
      const changes: PhotoChange[] = (c.changes ?? []).map((ch) => ({
        id: ch.id,
        comment: ch.comment ?? '',
        referenceImageUrl: ch.referenceImageUrl ?? '',
        referenceDescription: ch.referenceDescription ?? '',
        referenceUrl: ch.referenceUrl ?? '',
      }));
      const markers: Record<string, PhotoMarker[]> = {};
      for (const [url, list] of Object.entries(c.markers ?? {})) {
        markers[url] = (list ?? []).map((m) => ({ id: m.id, changeId: m.changeId, x: m.x, y: m.y }));
      }
      result[category] = pruneEmptyOrphanChanges({
        beforeUrls: c.beforeUrls ?? [],
        afterUrls: c.afterUrls ?? [],
        changes,
        markers,
      });
    } else {
      const changes: PhotoChange[] = [];
      const markers: Record<string, PhotoMarker[]> = {};
      const byContent = new Map<string, string>();
      for (const [url, list] of Object.entries(c?.pins ?? {})) {
        markers[url] = [];
        for (const p of list ?? []) {
          const change: PhotoChange = {
            id: p.id,
            comment: p.comment ?? '',
            referenceImageUrl: p.referenceImageUrl ?? '',
            referenceDescription: p.referenceDescription ?? '',
            referenceUrl: p.referenceUrl ?? '',
          };
          const key = JSON.stringify([
            change.comment.trim(),
            change.referenceImageUrl,
            change.referenceDescription.trim(),
            change.referenceUrl,
          ]);
          let changeId = byContent.get(key);
          if (!changeId) {
            changeId = change.id;
            byContent.set(key, changeId);
            changes.push(change);
          }
          markers[url].push({ id: `${p.id}-marker`, changeId, x: p.x, y: p.y });
        }
      }
      result[category] = { beforeUrls: c?.beforeUrls ?? [], afterUrls: c?.afterUrls ?? [], changes, markers };
    }
  }
  return result;
}

interface LegacyPhotoPin {
  id: string;
  x: number;
  y: number;
  comment?: string;
  referenceImageUrl?: string;
  referenceDescription?: string;
  referenceUrl?: string;
}

export interface Brief {
  id: string;
  objectId: string;
  // Кому направлено техзадание — имя и телефон подставляются из базы
  // подрядчиков при выборе, но остаются обычными полями формы: можно
  // вписать вручную человека, которого ещё нет в базе.
  recipientName: string;
  recipientPhone: string;
  photos: BriefPhotos;
  shareToken: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/briefsApi.ts.
// photos хранится единым JSONB-полем (тот же приём, что building_specs у
// объекта): вложенная структура категория→до/после/пины, разбивать на
// отдельные колонки под каждую категорию неудобно и негибко.
export interface BriefRow {
  id: string;
  object_id: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  photos: BriefPhotos | null;
  share_token: string;
  created_at: string;
}
