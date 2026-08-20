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
import { glassCardClass, glassCardShadow } from '../lib/glass';
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
        <Landmark className="h-16 w-16" />
      </div>
    );
  }
  return <img src={url} alt="" className={cn('shrink-0 rounded-control bg-surface-muted object-contain', className)} />;
}

// Узкая карточка вместо широкой строки таблицы — при логотипе такого
// размера (см. BankLogo ниже) полноширинная строка почти целиком состоит
// из пустого места вокруг него. Остальные поля — только в форме (Modal),
// открывается кликом по карточке.
function FinancingOfferCard({
  offer,
  onEdit,
  onDelete,
  deleting,
}: {
  offer: FinancingOffer;
  onEdit: (o: FinancingOffer) => void;
  onDelete: (o: FinancingOffer) => void;
  deleting: boolean;
}) {
  const colors = badgeColor(offer.status);
  return (
    <div
      onClick={() => onEdit(offer)}
      className={cn(
        'relative flex cursor-pointer flex-col items-center gap-3 p-4 text-center transition-colors hover:border-primary/40',
        glassCardClass,
      )}
      style={glassCardShadow}
    >
      <div className="absolute right-2 top-2 flex gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(offer);
          }}
          aria-label="Редактировать"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-ink-muted hover:border-primary hover:text-primary"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(offer);
          }}
          disabled={deleting}
          aria-label="Удалить"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <BankLogo url={offer.logoUrl} className="h-[173px] w-[173px]" />
      <Badge style={{ backgroundColor: colors.bg, color: colors.text }}>{offer.status}</Badge>
      <div className="flex w-full flex-col gap-1 text-sm text-ink-muted">
        <span>Ставка: {offer.rateOffer || '—'}</span>
        <span>Срок: {offer.maxTerm || '—'}</span>
      </div>
    </div>
  );
}

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

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем предложения...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
      {!loading && !loadError && offers.length === 0 && (
        <Card className="py-10 text-center text-sm text-ink-muted">Пока нет ни одного банка — добавь первый</Card>
      )}
      {!loading && !loadError && offers.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {offers.map((o) => (
            <FinancingOfferCard
              key={o.id}
              offer={o}
              onEdit={openEditModal}
              onDelete={handleDelete}
              deleting={deletingId === o.id}
            />
          ))}
        </div>
      )}

      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Редактировать банк' : 'Новый банк'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <BankLogo url={form.logoUrl} className="h-[173px] w-[173px]" />
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
