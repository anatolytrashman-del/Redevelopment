import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { BUSINESS_CENTER_CLASSES } from '../../data/businessCenters';
import type { BusinessCenter, RentalInfo } from '../../data/businessCenters';

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

interface FormState {
  slug: string;
  name: string;
  address: string;
  district: string;
  businessClass: string; // 'Не указан' | 'A' | 'B+' | 'B' | 'C'
  totalArea: string;
  yearBuilt: string;
  floors: string;
  developer: string;
  metro: string;
  parking: string;
  website: string;
  description: string;
  rentalCaveat: string;
  rentalTerms: string;
  rentalRates: string;
  rentalSizes: string;
  rentalParking: string;
  rentalContacts: string;
  photos: string; // по одному пути на строку
  status: BusinessCenter['status'];
  sortOrder: string;
}

const EMPTY_FORM: FormState = {
  slug: '',
  name: '',
  address: '',
  district: '',
  businessClass: 'Не указан',
  totalArea: '',
  yearBuilt: '',
  floors: '',
  developer: '',
  metro: '',
  parking: '',
  website: '',
  description: '',
  rentalCaveat: '',
  rentalTerms: '',
  rentalRates: '',
  rentalSizes: '',
  rentalParking: '',
  rentalContacts: '',
  photos: '',
  status: 'built',
  sortOrder: '0',
};

function centerToForm(c: BusinessCenter): FormState {
  return {
    slug: c.slug,
    name: c.name,
    address: c.address,
    district: c.district ?? '',
    businessClass: c.businessClass ?? 'Не указан',
    totalArea: c.totalArea != null ? String(c.totalArea) : '',
    yearBuilt: c.yearBuilt != null ? String(c.yearBuilt) : '',
    floors: c.floors != null ? String(c.floors) : '',
    developer: c.developer ?? '',
    metro: c.metro ?? '',
    parking: c.parking ?? '',
    website: c.website ?? '',
    description: c.description ?? '',
    rentalCaveat: c.rentalInfo?.caveat ?? '',
    rentalTerms: c.rentalInfo?.terms ?? '',
    rentalRates: c.rentalInfo?.rates ?? '',
    rentalSizes: c.rentalInfo?.sizes ?? '',
    rentalParking: c.rentalInfo?.parking ?? '',
    rentalContacts: c.rentalInfo?.contacts ?? '',
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

export function BusinessCentersAdminTab() {
  const [centers, setCenters] = useState<BusinessCenter[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<BusinessCenter | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    load();
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
  }

  function openNew() {
    setEditing('new');
    setForm({ ...EMPTY_FORM, sortOrder: String((centers?.length ?? 0)) });
  }

  function closeEdit() {
    setEditing(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) return;
    setSaving(true);
    try {
      const payload = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        address: form.address.trim(),
        district: form.district.trim() || null,
        businessClass: (form.businessClass === 'Не указан' ? null : form.businessClass) as BusinessCenter['businessClass'],
        totalArea: numOrNull(form.totalArea),
        yearBuilt: numOrNull(form.yearBuilt),
        floors: numOrNull(form.floors),
        developer: form.developer.trim() || null,
        metro: form.metro.trim() || null,
        parking: form.parking.trim() || null,
        website: form.website.trim() || null,
        description: form.description.trim() || null,
        rentalInfo: buildRentalInfo(form),
        photos: form.photos
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        status: form.status,
        sortOrder: numOrNull(form.sortOrder) ?? 0,
      };
      if (editing === 'new') {
        await insertBusinessCenter(payload);
      } else if (editing) {
        await updateBusinessCenter(editing.id, payload);
      }
      closeEdit();
      load();
    } catch {
      setError('Не удалось сохранить — проверьте поля (slug должен быть уникальным) и попробуйте ещё раз.');
    } finally {
      setSaving(false);
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
          <a href="/minsk/bcminsk" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
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
              {(centers ?? []).map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="max-w-[240px] px-4 py-3 font-medium text-ink">{c.name}</td>
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
              ))}
              {centers && centers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-ink-faint">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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

          <Textarea
            label="Фото (по одному пути на строку)"
            value={form.photos}
            onChange={(e) => setForm({ ...form, photos: e.target.value })}
            rows={2}
            placeholder={`/images/business-centers/${form.slug || 'slug'}.jpg`}
          />

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
