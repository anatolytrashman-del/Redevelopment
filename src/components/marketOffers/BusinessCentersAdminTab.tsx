import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, Circle, Loader2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { AddableSelect } from '../ui/AddableSelect';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  fetchBusinessCenters,
  insertBusinessCenter,
  updateBusinessCenter,
  deleteBusinessCenter,
} from '../../lib/businessCentersApi';
import {
  formatRatingHighlightText,
  mergeTenantOrganizations,
  parseBusinessCenterSnapshot,
} from '../../lib/businessCenterSnapshotParser';
import type { ParsedSnapshotReview } from '../../lib/businessCenterSnapshotParser';
import { parseHighlightRatings } from '../../lib/businessCenterDisplay';
import { supabase } from '../../lib/supabase';
import { BUSINESS_CENTER_CLASSES } from '../../data/businessCenters';
import type {
  BusinessCenter,
  DeveloperInfo,
  HighlightIconKey,
  HighlightSection,
  RentalInfo,
  TenantOrganization,
} from '../../data/businessCenters';
import type { DocumentFile } from '../../data/contractorDocuments';

// Подписи выбора иконки в форме — порядок совпадает с частотой использования
// на практике (история/арендаторы/СМИ чаще всего, 'warning'/'fact' — реже).
// 'award' отделён от 'media' (раньше было одно "Награды / СМИ"): награды
// уехали на публичной странице в собственный блок, а упоминания в прессе
// остались в "Интересных фактах" — одна подпись на два разных блока
// приводила к тому, что награда попадала не туда.
const HIGHLIGHT_ICON_LABELS: Record<HighlightIconKey, string> = {
  history: 'История объекта',
  tenants: 'Арендаторы',
  media: 'СМИ о здании',
  award: 'Награды',
  rating: 'Рейтинг на картах',
  reviews: 'Отзывы',
  design: 'Архитектура / дизайн',
  eco: 'Экология',
  warning: 'Важная оговорка',
  fact: 'Другой факт',
};
const HIGHLIGHT_ICON_KEYS = Object.keys(HIGHLIGHT_ICON_LABELS) as HighlightIconKey[];

// Вкладка "Бизнес-центры" на /admin/market-offers — админка для публичной
// страницы /minsk/bcminsk (владелец, 2026-09-04: "пусть это будет админка
// этой страницы... будем упорядочивать инфу там"). Данные — таблица
// Supabase business_centers (RLS: anon select, authenticated — полный
// CRUD), та же связка data/businessCenters.ts + lib/businessCentersApi.ts,
// что читает и сама публичная страница.
const CLASS_SELECT_OPTIONS = ['Не указан', ...BUSINESS_CENTER_CLASSES];

const STATUS_LABEL: Record<BusinessCenter['status'], string> = {
  built: 'Построен',
  under_construction: 'Строится',
};

// Список «по одному в строке» → массив: пустые строки и лишние пробелы
// выкидываем, иначе в базу уедут пустые плюсы, а на странице появятся
// пустые буллеты.
function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

interface FormState {
  slug: string;
  name: string;
  // Вторые названия одной строкой через запятую — в базе это text[], но в
  // форме массив из одного-двух значений не стоит отдельного редактора.
  altNames: string;
  address: string;
  district: string;
  businessClass: string; // 'Не указан' | 'A' | 'B+' | 'B' | 'C'
  totalArea: string;
  yearBuilt: string;
  floors: string;
  developer: string;
  developerLogoUrl: string;
  developerDescription: string;
  developerPhone: string;
  developerAddress: string;
  developerHours: string;
  developerWebsite: string;
  metro: string;
  parking: string;
  website: string;
  description: string;
  verdict: string;
  pros: string;
  cons: string;
  rentalCaveat: string;
  rentalTerms: string;
  rentalRates: string;
  rentalSizes: string;
  rentalParking: string;
  rentalContacts: string;
  highlights: HighlightSection[]; // "Интересные факты" — произвольный набор блоков
  reviewsChecked: boolean; // галочка "отзывы разобраны" в списке — см. комментарий у поля в data/businessCenters.ts
  tenantOrganizations: TenantOrganization[]; // организации внутри здания
  tenantOrganizationsBulk: string; // черновик для вставки списком (не сохраняется как есть)
  mapSnapshotFiles: DocumentFile[]; // уже загруженные
  pendingMapSnapshotFiles: File[]; // выбраны, но ещё не загружены (грузятся при сохранении)
  photos: string; // по одному пути на строку
  status: BusinessCenter['status'];
  sortOrder: string;
}

const EMPTY_FORM: FormState = {
  slug: '',
  name: '',
  altNames: '',
  address: '',
  district: '',
  businessClass: 'Не указан',
  totalArea: '',
  yearBuilt: '',
  floors: '',
  developer: '',
  developerLogoUrl: '',
  developerDescription: '',
  developerPhone: '',
  developerAddress: '',
  developerHours: '',
  developerWebsite: '',
  metro: '',
  parking: '',
  website: '',
  description: '',
  verdict: '',
  pros: '',
  cons: '',
  rentalCaveat: '',
  rentalTerms: '',
  rentalRates: '',
  rentalSizes: '',
  rentalParking: '',
  rentalContacts: '',
  highlights: [],
  reviewsChecked: false,
  tenantOrganizations: [],
  tenantOrganizationsBulk: '',
  mapSnapshotFiles: [],
  pendingMapSnapshotFiles: [],
  photos: '',
  status: 'built',
  sortOrder: '0',
};

function centerToForm(c: BusinessCenter): FormState {
  return {
    slug: c.slug,
    name: c.name,
    altNames: c.altNames.join(', '),
    address: c.address,
    district: c.district ?? '',
    businessClass: c.businessClass ?? 'Не указан',
    totalArea: c.totalArea != null ? String(c.totalArea) : '',
    yearBuilt: c.yearBuilt != null ? String(c.yearBuilt) : '',
    floors: c.floors != null ? String(c.floors) : '',
    developer: c.developer ?? '',
    developerLogoUrl: c.developerInfo?.logoUrl ?? '',
    developerDescription: c.developerInfo?.description ?? '',
    developerPhone: c.developerInfo?.phone ?? '',
    developerAddress: c.developerInfo?.address ?? '',
    developerHours: c.developerInfo?.hours ?? '',
    developerWebsite: c.developerInfo?.website ?? '',
    metro: c.metro ?? '',
    parking: c.parking ?? '',
    website: c.website ?? '',
    description: c.description ?? '',
    verdict: c.verdict ?? '',
    pros: c.pros.join('\n'),
    cons: c.cons.join('\n'),
    rentalCaveat: c.rentalInfo?.caveat ?? '',
    rentalTerms: c.rentalInfo?.terms ?? '',
    rentalRates: c.rentalInfo?.rates ?? '',
    rentalSizes: c.rentalInfo?.sizes ?? '',
    rentalParking: c.rentalInfo?.parking ?? '',
    rentalContacts: c.rentalInfo?.contacts ?? '',
    highlights: c.highlights,
    reviewsChecked: c.reviewsChecked,
    tenantOrganizations: c.tenantOrganizations,
    tenantOrganizationsBulk: '',
    mapSnapshotFiles: c.mapSnapshotFiles,
    pendingMapSnapshotFiles: [],
    photos: c.photos.join('\n'),
    status: c.status,
    sortOrder: String(c.sortOrder),
  };
}

function numOrNull(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

// Пустая форма → null целиком (не объект из одних null) — карточка "Условия
// для арендаторов" на публичной странице не рендерится вовсе, когда искать
// было нечего (сайта нет и т.п.), а не показывает пустой заголовок.
function buildRentalInfo(form: FormState): RentalInfo | null {
  const caveat = form.rentalCaveat.trim() || null;
  const terms = form.rentalTerms.trim() || null;
  const rates = form.rentalRates.trim() || null;
  const sizes = form.rentalSizes.trim() || null;
  const parking = form.rentalParking.trim() || null;
  const contacts = form.rentalContacts.trim() || null;
  if (!caveat && !terms && !rates && !sizes && !parking && !contacts) return null;
  return { caveat, terms, rates, sizes, parking, contacts };
}

// Та же логика "пустая форма → null целиком" — карточка застройщика на
// публичной странице не рендерится вовсе, пока по нему ничего не заполнено.
function buildDeveloperInfo(form: FormState): DeveloperInfo | null {
  const logoUrl = form.developerLogoUrl.trim() || null;
  const description = form.developerDescription.trim() || null;
  const phone = form.developerPhone.trim() || null;
  const address = form.developerAddress.trim() || null;
  const hours = form.developerHours.trim() || null;
  const website = form.developerWebsite.trim() || null;
  if (!logoUrl && !description && !phone && !address && !hours && !website) return null;
  return { logoUrl, description, phone, address, hours, website };
}

// Блоки с пустым текстом/подписью не сохраняем — та же логика, что раньше
// была у buildRentalInfo/buildHighlights (не хранить полупустые записи).
function buildHighlights(form: FormState): HighlightSection[] {
  return form.highlights
    .map((s) => ({ ...s, label: s.label.trim(), text: s.text.trim() }))
    .filter((s) => s.label && s.text);
}

function buildTenantOrganizations(form: FormState): TenantOrganization[] {
  return form.tenantOrganizations
    .map((o) => ({ name: o.name.trim(), category: o.category.trim() }))
    .filter((o) => o.name);
}

// Разбор вставки списком — по одной организации на строку, категория и
// название через "—"/"-"/":" (то, что реально получается копипастом из
// разобранного веб-архива, где категория идёт из aria-label ссылки, см.
// scripts/... в docs/session-journal.md журнале). Без разделителя — вся строка это
// название, категория пустая (можно дозаполнить руками).
function parseTenantOrganizationsBulk(text: string): TenantOrganization[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s*[—\-:]\s*(.+)$/);
      if (match) return { category: match[1].trim(), name: match[2].trim() };
      return { category: '', name: line };
    });
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

export function BusinessCentersAdminTab() {
  const [centers, setCenters] = useState<BusinessCenter[] | null>(null);
  const [error, setError] = useState('');
  // Отдельная от списочной error — та рисуется НАД таблицей, а таблица
  // скрыта под модалкой, пока форма открыта (см. Modal ниже), поэтому
  // ошибка сохранения молча пропадала из вида: владелец жал "Сохранить" и
  // не видел вообще ничего, даже если сохранение реально падало (см. журнал
  // 2026-09-05 про не загружающиеся .webarchive — этот баг и вскрыл).
  const [formError, setFormError] = useState('');
  const [editing, setEditing] = useState<BusinessCenter | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingReviewsId, setTogglingReviewsId] = useState<string | null>(null);
  // Адреса отдельных корпусов — структурная таблица, которую заполняет
  // scripts/capture-yandex-bc-tenants.mjs (сейчас есть только у «Проспекта»,
  // 4 строения). Владелец, 2026-09-20: "выводить адрес БЦ, включая разные
  // корпуса, чтобы можно было быстро в Яндексе искать" — для сбора отзывов
  // по каталогу нужен явный список адресов на каждое здание, а не переход в
  // форму редактирования ради одного поля.
  const [buildingAddressesBySlug, setBuildingAddressesBySlug] = useState<Record<string, string[]>>({});
  // Раньше приложенные файлы (не разобранные на отзывы — см. предупреждение
  // в тексте поля ниже) путали при беглом взгляде: похожи на "уже сделано",
  // хотя это старые файлы без отзывов. Владелец, 2026-09-20: "путаница...
  // просто выведи отображение для загрузки, а остальное убери из поля
  // зрения" — сворачиваем их за один клик, открытое поле загрузки — на виду.
  const [showOldSnapshotFiles, setShowOldSnapshotFiles] = useState(false);

  useEffect(() => {
    load();
    supabase
      .from('business_center_yandex_buildings')
      .select('business_center_slug,address,sort_order')
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        const grouped: Record<string, string[]> = {};
        for (const row of data ?? []) {
          (grouped[row.business_center_slug] ??= []).push(row.address);
        }
        setBuildingAddressesBySlug(grouped);
      });
  }, []);

  function load() {
    fetchBusinessCenters()
      .then(setCenters)
      .catch(() => setError('Не удалось загрузить список — попробуйте обновить страницу.'));
  }

  const districtOptions = useMemo(
    () => Array.from(new Set((centers ?? []).map((c) => c.district).filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b, 'ru')),
    [centers],
  );

  function openEdit(c: BusinessCenter) {
    setEditing(c);
    setForm(centerToForm(c));
    setFormError('');
    setShowOldSnapshotFiles(false);
  }

  function openNew() {
    setEditing('new');
    setForm({ ...EMPTY_FORM, sortOrder: String((centers?.length ?? 0)) });
    setFormError('');
    setShowOldSnapshotFiles(false);
  }

  // Файлы только запоминаются для разбора — в Storage они не уходят
  // (см. комментарий в handleSubmit). Загрузка отсюда убрана 2026-09-20:
  // её добавили тем же утром ради жалобы «файлы грузит уже секунд 40», а
  // отказ от хранения решает ту же жалобу радикальнее — грузить нечего.
  function addSnapshotFiles(files: File[]) {
    setForm((f) => ({ ...f, pendingMapSnapshotFiles: [...f.pendingMapSnapshotFiles, ...files] }));
  }

  function closeEdit() {
    setEditing(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) return;
    setSaving(true);
    setFormError('');
    try {
      // Веб-архивы БОЛЬШЕ НЕ ЗАГРУЖАЮТСЯ в Storage (2026-09-20). Разбор и так
      // идёт в браузере из локального File (parseBusinessCenterSnapshot читает
      // arrayBuffer), а хранение самого архива не давало ничего: его никто не
      // перечитывал — публичные страницы к нему не обращаются, повторного
      // разбора нет, в админке он только висел строкой со ссылкой.
      //
      // Платили за это квотой: 22 архива занимали 425 МБ — больше, чем все
      // остальные 833 файла бакета вместе, и 47% всего Storage проекта при
      // лимите бесплатного тарифа в 1 ГБ. Организация уже вышла за квоту, с
      // 8 октября проект начнут ограничивать. Плюс архив протухает: если
      // данные понадобится перечитать, брать надо свежий снимок.
      //
      // Заодно снимается боль с лимитом 50 МБ на файл (журнал 2026-09-05):
      // грузить больше нечего, а разбирается архив любого размера.
      // Владелец, 2026-09-06: "если в карточку БЦ загружается новый веб-архив,
      // система будет автоматически запускать обновление по этому БЦ и
      // менять контент на странице карточки БЦ". Реализовано узко (см.
      // businessCenterSnapshotParser.ts) — только структурные данные
      // (организации в здании + рейтинг), только для файлов, добавленных в
      // ЭТОМ сохранении (form.pendingMapSnapshotFiles, не весь архив
      // заново на каждый чих формы). Лучшее усилие — сбой разбора одного
      // файла не должен ронять сохранение самой формы.
      let autoTenantOrganizations: TenantOrganization[] = [];
      let autoRating: Awaited<ReturnType<typeof parseBusinessCenterSnapshot>>['rating'] = null;
      // Отзывы — тот же лучшее-усилие разбор, что и организации/рейтинг выше,
      // но пишутся не в highlights, а отдельной таблицей (см. отправку после
      // сохранения ниже): для здания с несколькими корпусами Светлана
      // прикладывает несколько файлов «Отзывы» разом, дедуп по автор+дата
      // между ними — тот же принцип, что уже собирает org-список.
      const autoReviewsBySlugKey = new Map<string, ParsedSnapshotReview>();
      for (const file of form.pendingMapSnapshotFiles) {
        try {
          const parsed = await parseBusinessCenterSnapshot(file);
          autoTenantOrganizations = mergeTenantOrganizations(autoTenantOrganizations, parsed.tenantOrganizations);
          if (parsed.rating) autoRating = parsed.rating; // последний файл с рейтингом побеждает
          for (const review of parsed.reviews) {
            const key = `${review.author}__${review.publishedAt}`;
            if (!autoReviewsBySlugKey.has(key)) autoReviewsBySlugKey.set(key, review);
          }
        } catch {
          // не смогли распознать конкретный файл — пропускаем, это бонус,
          // не обязательный шаг
        }
      }
      const autoReviews = [...autoReviewsBySlugKey.values()];

      let highlightsForSave = buildHighlights(form);
      // У БЦ с несколькими отдельными карточками на Яндекс.Картах (напр.
      // «Порт» — 3 очереди) текст рейтинга держит сводку по ВСЕМ корпусам
      // сразу и набирается вручную/ресёрчем — один вновь прикреплённый файл
      // видит только СВОЮ карточку и однажды уже затёр эту сводку одним
      // числом (владелец, 2026-09-20/21: "у порта пропала инфа про
      // несколько корпусов"). Автообновление рейтинга — только когда
      // существующий текст ещё не про несколько корпусов.
      const existingRatingIsMultiCorpus = parseHighlightRatings(highlightsForSave).some((r) => r.corpusCount > 1);
      if (autoRating && !existingRatingIsMultiCorpus) {
        const text = formatRatingHighlightText(autoRating);
        const idx = highlightsForSave.findIndex((h) => h.icon === 'rating');
        if (idx >= 0) highlightsForSave = highlightsForSave.map((h, i) => (i === idx ? { ...h, text } : h));
        else highlightsForSave = [{ icon: 'rating', label: 'Рейтинг на картах', text }, ...highlightsForSave];
      }

      const payload = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        altNames: form.altNames
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        address: form.address.trim(),
        district: form.district.trim() || null,
        businessClass: (form.businessClass === 'Не указан' ? null : form.businessClass) as BusinessCenter['businessClass'],
        totalArea: numOrNull(form.totalArea),
        yearBuilt: numOrNull(form.yearBuilt),
        floors: numOrNull(form.floors),
        developer: form.developer.trim() || null,
        developerInfo: buildDeveloperInfo(form),
        metro: form.metro.trim() || null,
        parking: form.parking.trim() || null,
        website: form.website.trim() || null,
        description: form.description.trim() || null,
        rentalInfo: buildRentalInfo(form),
        highlights: highlightsForSave,
        tenantOrganizations: mergeTenantOrganizations(buildTenantOrganizations(form), autoTenantOrganizations),
        // Старые записи сохраняются как есть, чтобы их можно было отвязать
        // руками; новых здесь больше не появляется (файлы больше не
        // загружаются в Storage — см. комментарий у handleSubmit).
        mapSnapshotFiles: form.mapSnapshotFiles,
        // Не редактируется в этой форме (см. комментарий у
        // BusinessCenter.technicalParams в data/businessCenters.ts — заполняется
        // отдельным ресерчем, не вручную) — при правке сохраняем как было, у
        // новой записи начинаем с пустого массива.
        technicalParams: editing !== 'new' && editing ? editing.technicalParams : [],
        // Тот же принцип, что у technicalParams выше — плоский список
        // фактов из Kufar/Realt/др. источников (см. комментарий у
        // BusinessCenter.buildingFacts), заполняется отдельным ресерчем.
        buildingFacts: editing !== 'new' && editing ? editing.buildingFacts : [],
        // Не редактируется здесь — заполняется отдельным импортом из 2GIS
        // (см. комментарий у BusinessCenter.nearestMetroStations), тот же
        // принцип, что и у technicalParams выше.
        nearestMetroStations: editing !== 'new' && editing ? editing.nearestMetroStations : [],
        // Тот же принцип — вычисляется point-in-polygon матчингом против
        // minsk_microdistricts, не вручную (см. комментарий у
        // BusinessCenter.microdistrict).
        microdistrict: editing !== 'new' && editing ? editing.microdistrict : null,
        photos: form.photos
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        status: form.status,
        sortOrder: numOrNull(form.sortOrder) ?? 0,
        // Б2. Пустые поля означают «пусть работает авточерновик»: тогда
        // verdictEdited сбрасывается в false и страница снова считает текст
        // по порогам. Как только владелец что-то написал — флаг поднимается,
        // и генерация его больше не трогает.
        verdict: form.verdict.trim() || null,
        pros: splitLines(form.pros),
        cons: splitLines(form.cons),
        verdictEdited: Boolean(form.verdict.trim() || form.pros.trim() || form.cons.trim()),
        // Отзывы этим сохранением реально прогрузились — ставим галочку
        // сами, Светлане отдельно кликать не нужно. Ручную отметку (напр.
        // «Аден» — вообще без отзывов) не трогаем и не сбрасываем.
        reviewsChecked: autoReviews.length > 0 ? true : form.reviewsChecked,
      };
      if (editing === 'new') {
        await insertBusinessCenter(payload);
      } else if (editing) {
        await updateBusinessCenter(editing.id, payload);
      }
      // Отзывы пишутся в отдельную таблицу через сервисный ключ (RLS не
      // пускает анонимную запись — см. api/import-business-center-reviews.js),
      // а не в payload выше как highlights. Лучшее усилие: форма уже
      // сохранена, сбой импорта отзывов не должен выглядеть как ошибка
      // сохранения всей карточки.
      if (autoReviews.length > 0) {
        try {
          await fetch('/api/import-business-center-reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: payload.slug, reviews: autoReviews }),
          });
        } catch {
          // не критично — карточка уже сохранена без отзывов, попробовать
          // можно ещё раз тем же файлом при следующем сохранении формы
        }
      }
      closeEdit();
      load();
    } catch (err) {
      // Реальный текст ошибки (в т.ч. сообщение про лимит файла из блока
      // выше) — не общая заглушка про slug: та маскировала настоящую
      // причину. setFormError, не setError — этот текст должен быть виден
      // ВНУТРИ ещё открытой модалки (см. комментарий у formError выше).
      setFormError(errorMessage(err, 'Не удалось сохранить — проверьте поля (slug должен быть уникальным) и попробуйте ещё раз.'));
    } finally {
      setSaving(false);
    }
  }

  // Быстрый клик прямо в списке, без открытия карточки — та же цель, что и
  // у "Удалить" рядом: разобрать все ~140 БЦ, не заходя в каждый ради одной
  // галочки. Частичный update (reviewsChecked) не трогает остальные поля.
  async function toggleReviewsChecked(c: BusinessCenter) {
    setTogglingReviewsId(c.id);
    try {
      await updateBusinessCenter(c.id, { reviewsChecked: !c.reviewsChecked });
      load();
    } catch {
      setError('Не удалось обновить галочку — попробуйте ещё раз.');
    } finally {
      setTogglingReviewsId(null);
    }
  }

  async function handleDelete(c: BusinessCenter) {
    if (!confirm(`Удалить «${c.name}»? Это уберёт карточку с публичной страницы.`)) return;
    setDeletingId(c.id);
    try {
      await deleteBusinessCenter(c.id);
      load();
    } catch {
      setError('Не удалось удалить.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Список объектов на публичной странице{' '}
          <a href="/minsk/bcminsk" target="_blank" rel="noopener noreferrer" className="text-primary-hover hover:underline">
            /minsk/bcminsk
          </a>
          {centers && <> · {centers.length} объектов</>}
        </p>
        <Button type="button" icon={<Plus className="h-4 w-4" />} onClick={openNew}>
          Добавить БЦ
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {centers === null && !error ? (
        <div className="flex items-center gap-2 text-sm text-ink-faint">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      ) : (
        <div className={cn('overflow-x-auto', glassCardClass)} style={glassCardShadow}>
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">Название</th>
                <th className="px-4 py-3">Адрес</th>
                <th className="px-4 py-3">Район</th>
                <th className="px-4 py-3">Класс</th>
                <th className="px-4 py-3">Площадь</th>
                <th className="px-4 py-3">Год</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Порядок</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(centers ?? []).map((c) => {
                const buildingAddresses = buildingAddressesBySlug[c.slug];
                // Несколько отдельных карточек на Яндекс.Картах на одно
                // здание (напр. «Порт» — 3 очереди) видно только из текста
                // рейтинга (нет структурного списка адресов, в отличие от
                // «Проспекта») — см. parseHighlightRatings в
                // businessCenterDisplay.ts, тот же разбор, что и в блоке
                // «Что говорят».
                const multiCardHint = parseHighlightRatings(c.highlights).some((r) => r.corpusCount > 1);
                return (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="max-w-[240px] px-4 py-3 font-medium text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      {/* Галочка "разобрано" — владелец, 2026-09-21: по
                          «Адену» (по факту гостиница, не классический БЦ,
                          отзывов с карт не будет никогда) сначала просили
                          убрать из списка, потом — оставить, но пометить
                          видимой галочкой, не убирать. Ставится сама, как
                          только в этом сохранении реально удалось прогрузить
                          отзывы (handleSubmit, reviewsChecked в payload), для
                          Адена и подобных случаев — вручную кликом здесь.
                          Задним числом простановлена для всех БЦ, где отзывы
                          в базе уже есть на момент этой правки (минимум
                          «Порт»), плюс «Аден». */}
                      <button
                        type="button"
                        onClick={() => toggleReviewsChecked(c)}
                        disabled={togglingReviewsId === c.id}
                        aria-label={c.reviewsChecked ? 'Отзывы разобраны — нажмите, чтобы снять отметку' : 'Отзывы ещё не разобраны — нажмите, чтобы отметить'}
                        title={c.reviewsChecked ? 'Отзывы собраны (или БЦ не нуждается в сборе)' : 'Отзывы ещё не собраны'}
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full disabled:opacity-50',
                          c.reviewsChecked ? 'text-primary' : 'text-ink-faint hover:text-ink-muted',
                        )}
                      >
                        {togglingReviewsId === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : c.reviewsChecked ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Circle className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {c.name}
                    </span>
                  </td>
                  <td className="max-w-[280px] px-4 py-3 text-xs text-ink-muted">
                    {buildingAddresses && buildingAddresses.length > 1 ? (
                      <div className="flex flex-col gap-0.5">
                        {buildingAddresses.map((addr) => (
                          <span key={addr}>{addr}</span>
                        ))}
                      </div>
                    ) : (
                      <span>{c.address}</span>
                    )}
                    {multiCardHint && (
                      <span className="mt-0.5 block text-ink-faint">(на Яндекс.Картах — несколько отдельных карточек)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{c.district ?? '—'}</td>
                  <td className="px-4 py-3">
                    {c.businessClass ? <Badge tone="primary">Класс {c.businessClass}</Badge> : <Badge>Не указан</Badge>}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{c.totalArea != null ? `${c.totalArea.toLocaleString('ru-RU')} м²` : '—'}</td>
                  <td className="px-4 py-3 text-ink-muted">{c.yearBuilt ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-muted">{STATUS_LABEL[c.status]}</td>
                  <td className="px-4 py-3 text-ink-muted">{c.sortOrder}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="flex h-8 w-8 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink"
                        aria-label="Редактировать"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        disabled={deletingId === c.id}
                        className="flex h-8 w-8 items-center justify-center rounded-control text-ink-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
                        aria-label="Удалить"
                      >
                        {deletingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {centers && centers.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-sm text-ink-faint">
                    Пока пусто — добавьте первый бизнес-центр.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing !== null} onClose={closeEdit} title={editing === 'new' ? 'Новый бизнес-центр' : 'Редактировать БЦ'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Временно вынесено в начало формы (было в самом низу) — владелец,
              2026-09-20: Светлана обходит весь каталог ради отзывов, скроллить
              вниз на каждой из ~140 карточек не нужно. Вернуть на обычное
              место (после организаций) можно после того, как каталог будет
              пройден. */}
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border-strong p-4">
            <p className="text-sm font-semibold text-ink">Файлы для ресерча (Яндекс.Карты, 2ГИС и т.п.)</p>
            <p className="text-xs text-ink-faint">
              Сохранённая страница организации на Яндекс.Картах, вкладка «Отзывы» (в Safari — «Сохранить как» →
              Web Archive, в Chrome — «Сохранить страницу» → .html). При сохранении формы файл разбирается
              автоматически: список организаций в здании, рейтинг и сами отзывы (текст, звёзды, лайки/дизлайки)
              обновляются без ручной работы — просто прикрепите файл и сохраните карточку. Файлы, приложенные
              раньше (до 2026-09-20), повторно не разбираются — их нужно приложить заново, если нужны отзывы.
              Сам файл никуда не загружается и не хранится: всё нужное из него достаётся прямо в браузере, а
              архив по 20 МБ занимал бы место впустую.
            </p>
            {form.mapSnapshotFiles.length > 0 && (
              showOldSnapshotFiles ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowOldSnapshotFiles(false)}
                    className="self-start text-xs font-semibold text-primary-hover hover:underline"
                  >
                    Скрыть старые файлы
                  </button>
                  {form.mapSnapshotFiles.map((file, i) => (
                    <div key={file.url} className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm text-ink">
                      <a href={file.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-primary-hover hover:underline">
                        {file.fileName}
                      </a>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, mapSnapshotFiles: f.mapSnapshotFiles.filter((_, idx) => idx !== i) }))}
                        aria-label="Убрать файл"
                        className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-faint hover:text-danger"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowOldSnapshotFiles(true)}
                  className="self-start text-xs text-ink-faint hover:text-ink-muted hover:underline"
                >
                  Старых файлов: {form.mapSnapshotFiles.length} (не отзывы, скрыто — показать)
                </button>
              )
            )}
            {form.pendingMapSnapshotFiles.map((file, i) => (
              <div key={`pending-${i}`} className="flex items-center gap-2 rounded-control border border-dashed border-border px-3 py-2 text-sm text-ink-muted">
                <span className="min-w-0 flex-1 truncate">
                  {file.name} <span className="text-ink-faint">— разберётся при сохранении</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, pendingMapSnapshotFiles: f.pendingMapSnapshotFiles.filter((_, idx) => idx !== i) }))
                  }
                  aria-label="Убрать файл"
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-faint hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-control border border-dashed border-border px-4 py-2.5 text-sm text-ink-muted hover:border-border-strong">
                <Upload className="h-4 w-4" />
                Добавить файл
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    if (picked.length) addSnapshotFiles(picked);
                  }}
                />
              </label>
              {/* Дублирует кнопку внизу формы — владелец, 2026-09-20: "выведи
                  кнопку Сохранить наверх карточки, чтобы не скролить" (модалка
                  скроллится целиком, у неё нет прибитого футера). */}
              <Button type="submit" disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </div>
            {formError && <p className="text-sm text-danger">{formError}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            {/* Второе имя того же здания, если его ищут ещё как-то (БЦ «V» =
                «Столица»). Не для перевода названия и не для имени
                управляющей компании — только для того, под чем здание
                действительно ищут: это имя попадёт в title, под заголовок,
                в описание и в FAQ. */}
            <Input
              label="Другие названия (через запятую)"
              value={form.altNames}
              onChange={(e) => setForm({ ...form, altNames: e.target.value })}
              placeholder="Столица"
            />
            <Input
              label="Slug (для URL/путей фото)"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="titul"
              required
            />
          </div>

          <Input label="Адрес" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AddableSelect
              label="Район"
              options={districtOptions}
              value={form.district}
              onChange={(v) => setForm({ ...form, district: v })}
              placeholder="Выберите район"
              newPlaceholder="Название района"
            />
            <Select
              label="Класс"
              options={CLASS_SELECT_OPTIONS}
              value={form.businessClass || 'Не указан'}
              onChange={(v) => setForm({ ...form, businessClass: v })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Площадь, м²"
              type="number"
              value={form.totalArea}
              onChange={(e) => setForm({ ...form, totalArea: e.target.value })}
            />
            <Input
              label="Год постройки/сдачи"
              type="number"
              value={form.yearBuilt}
              onChange={(e) => setForm({ ...form, yearBuilt: e.target.value })}
            />
            <Input label="Этажей" type="number" value={form.floors} onChange={(e) => setForm({ ...form, floors: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Статус"
              options={[STATUS_LABEL.built, STATUS_LABEL.under_construction]}
              value={STATUS_LABEL[form.status]}
              onChange={(v) =>
                setForm({ ...form, status: v === STATUS_LABEL.under_construction ? 'under_construction' : 'built' })
              }
            />
            <Input
              label="Порядок на странице"
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              helperText="Меньше число — выше в списке"
            />
          </div>

          <Input label="Застройщик / УК" value={form.developer} onChange={(e) => setForm({ ...form, developer: e.target.value })} />

          <div className="flex flex-col gap-3 rounded-control border border-border p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Карточка застройщика (для страницы БЦ)</p>
              <p className="text-xs text-ink-faint">
                Необязательно — заполняйте только там, где у застройщика есть нормальный сайт и о нём есть что
                сказать (по образцу карточки «Застройщик района» на гиде по Минск Миру). Пустая форма — блок на
                публичной странице просто не появляется, короткая строка «Застройщик / УК» выше продолжает работать
                как раньше.
              </p>
            </div>
            <Input
              label="Логотип (URL картинки)"
              value={form.developerLogoUrl}
              onChange={(e) => setForm({ ...form, developerLogoUrl: e.target.value })}
              placeholder="/images/developers/... или https://..."
            />
            <Textarea
              label="Описание застройщика"
              value={form.developerDescription}
              onChange={(e) => setForm({ ...form, developerDescription: e.target.value })}
              rows={3}
              placeholder="Когда основан, чем занимается, масштаб/годы на рынке, ключевые проекты"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Телефон"
                value={form.developerPhone}
                onChange={(e) => setForm({ ...form, developerPhone: e.target.value })}
              />
              <Input
                label="Сайт"
                value={form.developerWebsite}
                onChange={(e) => setForm({ ...form, developerWebsite: e.target.value })}
                placeholder="https://..."
              />
              <Input
                label="Адрес офиса"
                value={form.developerAddress}
                onChange={(e) => setForm({ ...form, developerAddress: e.target.value })}
              />
              <Input
                label="Часы работы"
                value={form.developerHours}
                onChange={(e) => setForm({ ...form, developerHours: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Метро" value={form.metro} onChange={(e) => setForm({ ...form, metro: e.target.value })} />
            <Input label="Парковка" value={form.parking} onChange={(e) => setForm({ ...form, parking: e.target.value })} />
          </div>

          <Input label="Сайт" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />

          <Textarea
            label="Описание"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
          />

          {/* Б2 «Кому подходит». Оставить всё пустым — нормальный рабочий
              режим: страница тогда показывает авточерновик, посчитанный по
              порогам (lib/businessCenterVerdict.ts). Заполнять имеет смысл
              там, где автоматика вышла топорной. */}
          <div className="flex flex-col gap-3 rounded-control border border-border p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Кому подходит (блок на публичной странице)</p>
              <p className="text-xs text-ink-faint">
                Пусто — страница сама соберёт черновик по данным (класс, метро, парковка, ставка, лоты).
                Заполненное здесь генерация больше не трогает. Плюсы и минусы — по одному в строке.
              </p>
            </div>
            <Textarea
              label="Вердикт одной фразой"
              value={form.verdict}
              onChange={(e) => setForm({ ...form, verdict: e.target.value })}
              rows={2}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Textarea
                label="Плюсы"
                value={form.pros}
                onChange={(e) => setForm({ ...form, pros: e.target.value })}
                rows={5}
              />
              <Textarea
                label="На что смотреть"
                value={form.cons}
                onChange={(e) => setForm({ ...form, cons: e.target.value })}
                rows={5}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-control border border-border p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Условия для арендаторов (с офиц. сайта БЦ)</p>
              <p className="text-xs text-ink-faint">
                Каждый пункт — с новой строки, начиная с «- » (список), важные цифры — в **двух звёздочках** (жирным).
                Строка без «- » в начале — обычный абзац.
              </p>
            </div>
            <Textarea
              label="Важная оговорка (если есть)"
              value={form.rentalCaveat}
              onChange={(e) => setForm({ ...form, rentalCaveat: e.target.value })}
              rows={2}
              placeholder="Напр.: сайт недоступен, данные устарели, это не БЦ, а гостиница..."
            />
            <Textarea
              label="Условия аренды"
              value={form.rentalTerms}
              onChange={(e) => setForm({ ...form, rentalTerms: e.target.value })}
              rows={4}
              placeholder={'- Минимальный срок договора — **1 год**\n- Коммунальные платежи включены в ставку'}
            />
            <Textarea
              label="Ставки"
              value={form.rentalRates}
              onChange={(e) => setForm({ ...form, rentalRates: e.target.value })}
              rows={2}
              placeholder="- От **26 BYN/м²**"
            />
            <Textarea
              label="Площади и типы помещений"
              value={form.rentalSizes}
              onChange={(e) => setForm({ ...form, rentalSizes: e.target.value })}
              rows={3}
            />
            <Textarea
              label="Парковка"
              value={form.rentalParking}
              onChange={(e) => setForm({ ...form, rentalParking: e.target.value })}
              rows={2}
            />
            <Textarea
              label="Контакты отдела аренды"
              value={form.rentalContacts}
              onChange={(e) => setForm({ ...form, rentalContacts: e.target.value })}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-control border border-border p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Интересные факты</p>
              <p className="text-xs text-ink-faint">
                Произвольный набор блоков — добавляйте только то, что реально нашлось (нет наград — не добавляйте
                блок вовсе), для нетипичного факта берите тип «Другой факт» и пишите свою подпись. Та же нотация в
                тексте: «- » для буллетов, **жирным** — ключевые цифры/названия. Рейтинг/отзывы с карт — только
                вручную (скриншот/копия из своего браузера), автопоиск для них ненадёжен. Тип «Награды» на публичной
                странице показывается НЕ здесь, а своим блоком списком: каждая строка текста — отдельный пункт, подпись
                раздела не выводится, поэтому пишите одну награду в строку и так, чтобы строка читалась сама по себе.
              </p>
            </div>
            {form.highlights.map((section, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-control border border-border bg-surface-muted p-3">
                <div className="flex items-center gap-2">
                  <Select
                    options={HIGHLIGHT_ICON_KEYS.map((k) => HIGHLIGHT_ICON_LABELS[k])}
                    value={HIGHLIGHT_ICON_LABELS[section.icon]}
                    onChange={(label) => {
                      const icon = HIGHLIGHT_ICON_KEYS.find((k) => HIGHLIGHT_ICON_LABELS[k] === label) ?? 'fact';
                      setForm((f) => ({
                        ...f,
                        highlights: f.highlights.map((s, idx) => (idx === i ? { ...s, icon } : s)),
                      }));
                    }}
                    triggerClassName="w-56"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, highlights: f.highlights.filter((_, idx) => idx !== i) }))}
                    aria-label="Убрать блок"
                    className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-faint hover:bg-danger-bg hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <Input
                  label="Подпись раздела"
                  value={section.label}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      highlights: f.highlights.map((s, idx) => (idx === i ? { ...s, label: e.target.value } : s)),
                    }))
                  }
                  placeholder="Напр.: История объекта"
                />
                <Textarea
                  label="Текст"
                  value={section.text}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      highlights: f.highlights.map((s, idx) => (idx === i ? { ...s, text: e.target.value } : s)),
                    }))
                  }
                  rows={3}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() =>
                setForm((f) => ({ ...f, highlights: [...f.highlights, { icon: 'fact', label: '', text: '' }] }))
              }
            >
              Добавить блок
            </Button>
          </div>

          <div className="flex flex-col gap-3 rounded-control border border-border p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Организации внутри здания</p>
              <p className="text-xs text-ink-faint">
                Из карусели "Организации внутри" на Яндекс.Картах (веб-архив). На публичной странице
                группируются по категории автоматически — вводить готовым списком не нужно, порядок не важен.
                Категория — из подписи ссылки на карте (напр. «Банк», «IT-компания»), можно оставить пустой.
              </p>
            </div>
            {form.tenantOrganizations.length > 0 && (
              <div className="flex flex-col gap-2">
                {form.tenantOrganizations.map((org, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-40 shrink-0">
                      <Input
                        value={org.category}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            tenantOrganizations: f.tenantOrganizations.map((o, idx) => (idx === i ? { ...o, category: e.target.value } : o)),
                          }))
                        }
                        placeholder="Категория"
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        value={org.name}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            tenantOrganizations: f.tenantOrganizations.map((o, idx) => (idx === i ? { ...o, name: e.target.value } : o)),
                          }))
                        }
                        placeholder="Название организации"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tenantOrganizations: f.tenantOrganizations.filter((_, idx) => idx !== i) }))}
                      aria-label="Убрать организацию"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-faint hover:bg-danger-bg hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setForm((f) => ({ ...f, tenantOrganizations: [...f.tenantOrganizations, { category: '', name: '' }] }))}
            >
              Добавить организацию
            </Button>
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <Textarea
                label="Или вставить списком (по одной на строку: «Категория — Название»)"
                value={form.tenantOrganizationsBulk}
                onChange={(e) => setForm((f) => ({ ...f, tenantOrganizationsBulk: e.target.value }))}
                rows={3}
                placeholder={'Банк — Сбер Банк\nIT-компания — Vadarod'}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    tenantOrganizations: [...f.tenantOrganizations, ...parseTenantOrganizationsBulk(f.tenantOrganizationsBulk)],
                    tenantOrganizationsBulk: '',
                  }))
                }
                disabled={!form.tenantOrganizationsBulk.trim()}
              >
                Добавить из списка
              </Button>
            </div>
          </div>

          <Textarea
            label="Фото (по одному пути на строку)"
            value={form.photos}
            onChange={(e) => setForm({ ...form, photos: e.target.value })}
            rows={2}
            placeholder={`/images/business-centers/${form.slug || 'slug'}.jpg`}
          />

          {formError && <p className="text-sm text-danger">{formError}</p>}

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={closeEdit}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
