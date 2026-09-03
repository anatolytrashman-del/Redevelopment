import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AddableSelect } from '../ui/AddableSelect';
import { PledgePhoto } from './PledgePhoto';
import type { Pledge } from '../../data/pledges';
import { insertPledge, updatePledge, uploadPledgePhoto, deletePledgePhoto } from '../../lib/pledgesApi';
import { cn } from '../../lib/cn';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const emptyForm = {
  address: '',
  propertyType: '',
  area: '',
  marketValue: '',
  pledgeValue: '',
  rentalIncome: '',
  photoPaths: [] as string[],
  certificatePhotoPath: '',
  underConstruction: false,
  completionYear: '',
  purchasePrice: '',
};

function pledgeToForm(p: Pledge) {
  return {
    address: p.address,
    propertyType: p.propertyType,
    area: p.area ? String(p.area) : '',
    marketValue: p.marketValue ? String(p.marketValue) : '',
    pledgeValue: p.pledgeValue ? String(p.pledgeValue) : '',
    rentalIncome: p.rentalIncome ? String(p.rentalIncome) : '',
    photoPaths: p.photoPaths,
    certificatePhotoPath: p.certificatePhotoPath,
    underConstruction: p.underConstruction,
    completionYear: p.completionYear ? String(p.completionYear) : '',
    purchasePrice: p.purchasePrice ? String(p.purchasePrice) : '',
  };
}

interface PledgeFormModalProps {
  open: boolean;
  // null — создание нового залога, иначе редактирование существующего.
  pledge: Pledge | null;
  // Известные типы объекта (пресет + фактически встречающиеся значения) —
  // считает родитель по всему списку залогов, тот же паттерн, что
  // knownSpecialties в Contractors.tsx.
  knownTypes: string[];
  onClose: () => void;
  onSaved: (p: Pledge) => void;
}

export function PledgeFormModal({ open, pledge, knownTypes, onClose, onSaved }: PledgeFormModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [certificateUploading, setCertificateUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(pledge ? pledgeToForm(pledge) : emptyForm);
      setSubmitError(null);
    }
  }, [open, pledge]);

  // Фото уходит в бакет сразу при выборе файла — тот же приём, что и у
  // лидов/подрядчиков, но добавляется в массив, а не заменяет единственное фото.
  async function handlePhotoAdd(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || photoUploading) return;

    setPhotoUploading(true);
    setSubmitError(null);
    try {
      const path = await uploadPledgePhoto(file);
      setForm((f) => ({ ...f, photoPaths: [...f.photoPaths, path] }));
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось загрузить фото'));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handlePhotoRemove(path: string) {
    setForm((f) => ({ ...f, photoPaths: f.photoPaths.filter((p) => p !== path) }));
    await deletePledgePhoto(path);
  }

  async function handleCertificateAdd(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || certificateUploading) return;

    setCertificateUploading(true);
    setSubmitError(null);
    try {
      const previous = form.certificatePhotoPath;
      const path = await uploadPledgePhoto(file);
      setForm((f) => ({ ...f, certificatePhotoPath: path }));
      if (previous) await deletePledgePhoto(previous);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось загрузить свидетельство'));
    } finally {
      setCertificateUploading(false);
    }
  }

  async function handleCertificateRemove() {
    const path = form.certificatePhotoPath;
    setForm((f) => ({ ...f, certificatePhotoPath: '' }));
    if (path) await deletePledgePhoto(path);
  }

  const canSubmit = form.address.trim().length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      address: form.address,
      propertyType: form.propertyType,
      area: Number(form.area) || 0,
      marketValue: Number(form.marketValue) || 0,
      pledgeValue: Number(form.pledgeValue) || 0,
      rentalIncome: Number(form.rentalIncome) || 0,
      photoPaths: form.photoPaths,
      certificatePhotoPath: form.certificatePhotoPath,
      underConstruction: form.underConstruction,
      completionYear: Number(form.completionYear) || 0,
      purchasePrice: Number(form.purchasePrice) || 0,
    };
    try {
      const saved = pledge ? await updatePledge(pledge.id, payload) : await insertPledge(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить объект'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={pledge ? 'Редактировать залог' : 'Новый объект для залога'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Адрес"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          required
        />

        <AddableSelect
          label="Тип объекта"
          placeholder="Не выбрано"
          options={knownTypes}
          value={form.propertyType}
          onChange={(v) => setForm((f) => ({ ...f, propertyType: v }))}
          addLabel="+ Добавить тип"
          newPlaceholder="Название типа"
        />

        <label className="flex w-fit items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={form.underConstruction}
            onChange={(e) => setForm((f) => ({ ...f, underConstruction: e.target.checked }))}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          🏗 Ещё не построен (карточка без фото, с годом сдачи вместо превью)
        </label>

        {form.underConstruction ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Площадь, м²"
              type="number"
              value={form.area}
              onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
            />
            <Input
              label="Год сдачи"
              type="number"
              placeholder="2027"
              value={form.completionYear}
              onChange={(e) => setForm((f) => ({ ...f, completionYear: e.target.value }))}
            />
            <Input
              label="Цена покупки, $"
              type="number"
              value={form.purchasePrice}
              onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Площадь, м²"
                type="number"
                value={form.area}
                onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
              />
              <Input
                label="Арендный доход, $"
                type="number"
                value={form.rentalIncome}
                onChange={(e) => setForm((f) => ({ ...f, rentalIncome: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Рыночная стоимость, $"
                type="number"
                value={form.marketValue}
                onChange={(e) => setForm((f) => ({ ...f, marketValue: e.target.value }))}
              />
              <Input
                label="Залоговая стоимость, $"
                type="number"
                value={form.pledgeValue}
                onChange={(e) => setForm((f) => ({ ...f, pledgeValue: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">Фотографии</span>
              <div className="flex flex-wrap gap-2">
                {form.photoPaths.map((path) => (
                  <div key={path} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-control">
                    <PledgePhoto path={path} className="h-full w-full" />
                    <button
                      type="button"
                      onClick={() => handlePhotoRemove(path)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/60 text-white hover:bg-danger"
                      aria-label="Удалить фото"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label
                  className={cn(
                    'flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed border-border text-ink-faint hover:border-border-strong',
                    photoUploading && 'pointer-events-none opacity-50',
                  )}
                >
                  {photoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span className="text-[10px]">Добавить</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoAdd} />
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">Свидетельство БРТИ</span>
              <div className="flex flex-wrap gap-2">
                {form.certificatePhotoPath ? (
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-control">
                    <PledgePhoto path={form.certificatePhotoPath} className="h-full w-full" />
                    <button
                      type="button"
                      onClick={handleCertificateRemove}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/60 text-white hover:bg-danger"
                      aria-label="Удалить свидетельство"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label
                    className={cn(
                      'flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed border-border text-ink-faint hover:border-border-strong',
                      certificateUploading && 'pointer-events-none opacity-50',
                    )}
                  >
                    {certificateUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span className="text-[10px]">Загрузить</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleCertificateAdd} />
                  </label>
                )}
              </div>
            </div>
          </>
        )}

        {submitError && <p className="text-sm text-danger">{submitError}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting}>
            {submitting ? 'Сохраняем...' : pledge ? 'Сохранить' : 'Добавить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
