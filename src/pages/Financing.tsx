import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Pencil, Trash2, Upload, Landmark } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AddableSelect } from '../components/ui/AddableSelect';
import { Modal } from '../components/ui/Modal';
import { financingStatuses, type FinancingOffer } from '../data/financing';
import { badgeColor } from '../lib/badgeColor';
import { cn } from '../lib/cn';
import {
  fetchFinancingOffers,
  insertFinancingOffer,
  updateFinancingOffer,
  deleteFinancingOffer,
  uploadFinancingLogo,
} from '../lib/financingApi';

function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Сайт может быть введён и с протоколом, и без — сохраняем как ввели, а
// ссылку в таблице всегда собираем на https, чтобы клик открывал страницу,
// а не пытался перейти на relative-путь текущего приложения.
function websiteHref(website: string) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

const emptyForm = {
  logoUrl: '',
  bankName: '',
  creditName: '',
  website: '',
  generalEmail: '',
  managerName: '',
  managerContact: '',
  rateOffer: '',
  maxTerm: '',
  status: financingStatuses[0] as string,
};

function offerToForm(o: FinancingOffer) {
  return {
    logoUrl: o.logoUrl,
    bankName: o.bankName,
    creditName: o.creditName,
    website: o.website,
    generalEmail: o.generalEmail,
    managerName: o.managerName,
    managerContact: o.managerContact,
    rateOffer: o.rateOffer,
    maxTerm: o.maxTerm,
    status: o.status,
  };
}

function BankLogo({ url, className }: { url: string; className?: string }) {
  if (!url) {
    return (
      <div className={cn('flex shrink-0 items-center justify-center rounded-control bg-surface-muted text-ink-faint', className)}>
        <Landmark className="h-5 w-5" />
      </div>
    );
  }
  return <img src={url} alt="" className={cn('shrink-0 rounded-control bg-surface-muted object-contain', className)} />;
}

const gridCols = 'grid-cols-[64px_170px_150px_190px_150px_150px_130px_110px_190px_80px]';

export function Financing() {
  const [offers, setOffers] = useState<FinancingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Статусы — открытый список: стартовые пять + всё, что уже встречалось
  // (в т.ч. добавленное через форму ранее), как requirement/clientType у лидов.
  const knownStatuses = useMemo(() => {
    const set = new Set<string>(financingStatuses);
    offers.forEach((o) => set.add(o.status));
    return [...set];
  }, [offers]);

  useEffect(() => {
    fetchFinancingOffers()
      .then(setOffers)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить предложения')))
      .finally(() => setLoading(false));
  }, []);

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setSubmitError(null);
    setOpen(true);
  }

  function openEditModal(o: FinancingOffer) {
    setEditingId(o.id);
    setForm(offerToForm(o));
    setSubmitError(null);
    setOpen(true);
  }

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || logoUploading) return;
    setLogoUploading(true);
    setSubmitError(null);
    try {
      const url = await uploadFinancingLogo(file);
      setForm((f) => ({ ...f, logoUrl: url }));
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось загрузить логотип'));
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      logoUrl: form.logoUrl,
      bankName: form.bankName.trim(),
      creditName: form.creditName.trim(),
      website: form.website.trim(),
      generalEmail: form.generalEmail.trim(),
      managerName: form.managerName.trim(),
      managerContact: form.managerContact.trim(),
      rateOffer: form.rateOffer.trim(),
      maxTerm: form.maxTerm.trim(),
      status: form.status,
    };
    try {
      if (editingId) {
        const updated = await updateFinancingOffer(editingId, payload);
        setOffers((prev) => prev.map((o) => (o.id === editingId ? updated : o)));
      } else {
        const created = await insertFinancingOffer(payload);
        setOffers((prev) => [...prev, created]);
      }
      setForm(emptyForm);
      setEditingId(null);
      setOpen(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить предложение'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(o: FinancingOffer) {
    if (!window.confirm(`Удалить «${o.bankName || o.creditName || 'без названия'}» из списка?`)) return;
    setDeletingId(o.id);
    setDeleteError(null);
    try {
      await deleteFinancingOffer(o.id);
      setOffers((prev) => prev.filter((x) => x.id !== o.id));
    } catch (err) {
      setDeleteError(errorMessage(err, 'Не удалось удалить'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Финансирование"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
            Добавить банк
          </Button>
        }
      />

      <Card className="flex flex-col gap-4 p-0">
        {/* От lg и шире — таблица-грид, много колонок под каждое поле из
            запроса. Ниже lg — карточки. */}
        <div className="hidden overflow-x-auto lg:block">
          <div className={cn('grid min-w-[1500px] items-center gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wide text-ink-faint', gridCols)}>
            <span>Лого</span>
            <span>Банк</span>
            <span>Сайт</span>
            <span>Почта</span>
            <span>Менеджер</span>
            <span>Контакт</span>
            <span>Ставка</span>
            <span>Срок</span>
            <span>Статус</span>
            <span />
          </div>
          {offers.map((o) => {
            const colors = badgeColor(o.status);
            return (
              <div key={o.id} className={cn('grid min-w-[1500px] items-center gap-4 border-t border-border px-6 py-4 text-sm', gridCols)}>
                <BankLogo url={o.logoUrl} className="h-10 w-10" />
                <span className="truncate font-semibold text-ink">{o.bankName}</span>
                <span className="truncate">
                  {o.website ? (
                    <a href={websiteHref(o.website)} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                      {o.website.replace(/^https?:\/\//i, '')}
                    </a>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </span>
                <span className="truncate">
                  {o.generalEmail ? (
                    <a href={`mailto:${o.generalEmail}`} className="truncate text-primary hover:underline">
                      {o.generalEmail}
                    </a>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </span>
                <span className="truncate text-ink-muted">{o.managerName || '—'}</span>
                <span className="truncate text-ink-muted">{o.managerContact || '—'}</span>
                <span className="truncate text-ink-muted">{o.rateOffer || '—'}</span>
                <span className="truncate text-ink-muted">{o.maxTerm || '—'}</span>
                <span>
                  <Badge style={{ backgroundColor: colors.bg, color: colors.text }}>{o.status}</Badge>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditModal(o)}
                    aria-label="Редактировать"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(o)}
                    disabled={deletingId === o.id}
                    aria-label="Удалить"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем предложения...
            </div>
          )}
          {!loading && loadError && <div className="px-6 py-10 text-center text-sm text-danger">{loadError}</div>}
          {!loading && !loadError && offers.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-ink-muted">Пока нет ни одного банка — добавь первый</div>
          )}
        </div>

        <div className="flex flex-col gap-3 p-4 lg:hidden">
          {offers.map((o) => {
            const colors = badgeColor(o.status);
            return (
              <div key={o.id} className="flex flex-col gap-2.5 rounded-control border border-border p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <BankLogo url={o.logoUrl} className="h-10 w-10" />
                    <span className="min-w-0 break-words font-semibold text-ink">{o.bankName}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(o)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                      aria-label="Редактировать"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(o)}
                      disabled={deletingId === o.id}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
                      aria-label="Удалить"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <Badge style={{ backgroundColor: colors.bg, color: colors.text }} className="w-fit">
                  {o.status}
                </Badge>
                <div className="flex flex-col gap-1 text-sm text-ink-muted">
                  {o.website && (
                    <span>
                      Сайт:{' '}
                      <a href={websiteHref(o.website)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {o.website.replace(/^https?:\/\//i, '')}
                      </a>
                    </span>
                  )}
                  {o.generalEmail && (
                    <span>
                      Почта:{' '}
                      <a href={`mailto:${o.generalEmail}`} className="text-primary hover:underline">
                        {o.generalEmail}
                      </a>
                    </span>
                  )}
                  {o.managerName && <span>Менеджер: {o.managerName}</span>}
                  {o.managerContact && <span>Контакт: {o.managerContact}</span>}
                  {o.rateOffer && <span>Ставка: {o.rateOffer}</span>}
                  {o.maxTerm && <span>Срок: {o.maxTerm}</span>}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем предложения...
            </div>
          )}
          {!loading && loadError && <div className="py-10 text-center text-sm text-danger">{loadError}</div>}
          {!loading && !loadError && offers.length === 0 && (
            <div className="py-10 text-center text-sm text-ink-muted">Пока нет ни одного банка — добавь первый</div>
          )}
        </div>
      </Card>

      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Редактировать банк' : 'Новый банк'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <BankLogo url={form.logoUrl} className="h-16 w-16" />
            <label
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-control border border-dashed border-border px-4 py-2.5 text-sm text-ink-muted hover:border-border-strong',
                logoUploading && 'pointer-events-none opacity-50',
              )}
            >
              {logoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {form.logoUrl ? 'Заменить логотип' : 'Загрузить логотип'}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
            </label>
          </div>

          <Input
            label="Название кредита"
            placeholder="Например, Инвестиционный кредит на приобретение ОС"
            value={form.creditName}
            onChange={(e) => setForm((f) => ({ ...f, creditName: e.target.value }))}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Сайт банка"
              placeholder="bank.by"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            />
            <Input
              label="Общая почта"
              type="email"
              placeholder="info@bank.by"
              value={form.generalEmail}
              onChange={(e) => setForm((f) => ({ ...f, generalEmail: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Имя личного менеджера"
              value={form.managerName}
              onChange={(e) => setForm((f) => ({ ...f, managerName: e.target.value }))}
            />
            <Input
              label="Контакт личного менеджера"
              placeholder="Телефон, Telegram..."
              value={form.managerContact}
              onChange={(e) => setForm((f) => ({ ...f, managerContact: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Предложение по ставке"
              placeholder="Например, 12% USD"
              value={form.rateOffer}
              onChange={(e) => setForm((f) => ({ ...f, rateOffer: e.target.value }))}
            />
            <Input
              label="Максимальный срок"
              placeholder="Например, 120 месяцев"
              value={form.maxTerm}
              onChange={(e) => setForm((f) => ({ ...f, maxTerm: e.target.value }))}
            />
          </div>

          <AddableSelect
            label="Статус"
            options={knownStatuses}
            value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status: v }))}
            addLabel="+ Добавить статус"
            newPlaceholder="Название статуса"
          />

          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
