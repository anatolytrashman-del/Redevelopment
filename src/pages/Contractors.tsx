import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Trash2, Upload, X, FileText } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AddableSelect } from '../components/ui/AddableSelect';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import { ContractorAvatar } from '../components/contractors/ContractorAvatar';
import { ContractorCard } from '../components/contractors/ContractorCard';
import { ContractorDetailModal } from '../components/contractors/ContractorDetailModal';
import { contractorSpecialties, contractorContactMethods, contractorTeamTiers, type Contractor } from '../data/contractors';
import {
  fetchContractors,
  insertContractor,
  updateContractor,
  deleteContractor,
  uploadContractorPhoto,
  deleteContractorPhoto,
  uploadContractorResume,
  deleteContractorResume,
  tryAutoFillTelegramAvatarForContractor,
} from '../lib/contractorsApi';
import { cn } from '../lib/cn';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const emptyForm = {
  name: '',
  specialty: '',
  contact: '',
  contactMethod: '',
  phone: '',
  email: '',
  notes: '',
  paymentTerms: '',
  teamTier: '',
  responsibilityZone: '',
  photoPath: '',
  birthday: '',
  resumePath: '',
  resumeFileName: '',
};

function contractorToForm(c: Contractor) {
  return {
    name: c.name,
    specialty: c.specialty,
    contact: c.contact,
    contactMethod: c.contactMethod,
    phone: c.phone,
    email: c.email,
    notes: c.notes,
    paymentTerms: c.paymentTerms,
    teamTier: c.teamTier,
    responsibilityZone: c.responsibilityZone,
    photoPath: c.photoPath,
    birthday: c.birthday,
    resumePath: c.resumePath,
    resumeFileName: c.resumeFileName,
  };
}

// "Подрядчики" переименована в "Команда" (владелец, 2026-08-29: "текущую
// вкладку 'Подрядчики' переименовывать в 'Команда' и оставлять там только
// Part-time и проверенных") — фильтрация не поменялась, страница и сейчас
// показывает только teamTier-заполненных (см. tierGroups ниже). Вкладка
// "Ресерч" (сравнение предложений подрядчиков на услуги — оценка здания,
// вывоз мусора и т.п.) отсюда убрана и перенесена на страницу "Закупки"
// (владелец, 2026-09-02: "перенеси вот это в подрядчиков, это не команда" —
// в Suppliers.tsx, вкладка "Ресерч", секция "Подрядчики"), эта страница
// теперь только про состав команды, без переключателя.
export function Contractors() {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Карточка подрядчика (просмотр) — промежуточный шаг между списком и формой,
  // тот же приём, что и detailId у лидов.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [resumeUploading, setResumeUploading] = useState(false);

  useEffect(() => {
    fetchContractors()
      .then((loaded) => {
        setContractors(loaded);
        // Один раз при загрузке страницы пробуем подтянуть фото для команды и
        // part-time консультантов — тех, кто уже был занесён до этой фичи и
        // остался без фото. Этот круг людей всегда маленький (несколько
        // человек), поэтому пройтись по всем сразу безопасно — в отличие от
        // подрядчиков, где так делать не стоит.
        loaded
          .filter((c) => c.teamTier && !c.photoPath)
          .forEach((c) => {
            tryAutoFillTelegramAvatarForContractor(c).then((updated) => {
              if (updated) setContractors((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            });
          });
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить подрядчиков')))
      .finally(() => setLoading(false));
  }, []);

  const knownSpecialties = useMemo(() => {
    const set = new Set<string>(contractorSpecialties);
    contractors.forEach((c) => c.specialty && set.add(c.specialty));
    return [...set];
  }, [contractors]);

  const knownContactMethods = useMemo(() => {
    const set = new Set<string>(contractorContactMethods);
    contractors.forEach((c) => c.contactMethod && set.add(c.contactMethod));
    return [...set];
  }, [contractors]);

  const knownTeamTiers = useMemo(() => {
    const set = new Set<string>(contractorTeamTiers);
    contractors.forEach((c) => c.teamTier && set.add(c.teamTier));
    return [...set];
  }, [contractors]);

  // Динамические блоки по занятости (Команда/Part-time/своё значение) — вместо
  // одной жёстко прибитой группы "Команда". Порядок: сначала пресет
  // (contractorTeamTiers), затем любые кастомные значения в порядке появления
  // в данных — так третий уровень занятости не потребует правок кода.
  const tierGroups = useMemo(() => {
    const byTier = new Map<string, Contractor[]>();
    contractors.forEach((c) => {
      if (!c.teamTier) return;
      const list = byTier.get(c.teamTier) ?? [];
      list.push(c);
      byTier.set(c.teamTier, list);
    });
    const order = [...contractorTeamTiers, ...[...byTier.keys()].filter((t) => !(contractorTeamTiers as readonly string[]).includes(t))];
    return order.filter((tier) => byTier.has(tier)).map((tier) => ({ tier, items: byTier.get(tier)! }));
  }, [contractors]);

  const detailContractor = detailId ? (contractors.find((c) => c.id === detailId) ?? null) : null;
  const editingContractor = editingId ? (contractors.find((c) => c.id === editingId) ?? null) : null;

  const canSubmit = form.name && form.specialty && form.contact;

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setSubmitError(null);
    setOpen(true);
  }

  function openEditModal(c: Contractor) {
    setEditingId(c.id);
    setForm(contractorToForm(c));
    setSubmitError(null);
    // Карточку закрываем: две модалки одновременно перекрывали бы друг друга.
    setDetailId(null);
    setOpen(true);
  }

  // Фото уходит в бакет сразу при выборе файла — тот же приём, что и у лидов
  // (см. handlePhotoChange в Leads.tsx).
  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || photoUploading) return;

    setPhotoUploading(true);
    setSubmitError(null);
    const previous = form.photoPath;
    try {
      const path = await uploadContractorPhoto(file);
      setForm((f) => ({ ...f, photoPath: path }));
      if (previous) await deleteContractorPhoto(previous);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось загрузить фото'));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handlePhotoRemove() {
    const path = form.photoPath;
    setForm((f) => ({ ...f, photoPath: '' }));
    await deleteContractorPhoto(path);
  }

  // Резюме — тот же приём, что и фото выше (сразу в бакет при выборе файла),
  // только без ограничения на тип (accept у инпута ниже принимает pdf/doc/docx).
  async function handleResumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || resumeUploading) return;

    setResumeUploading(true);
    setSubmitError(null);
    const previous = form.resumePath;
    try {
      const path = await uploadContractorResume(file);
      setForm((f) => ({ ...f, resumePath: path, resumeFileName: file.name }));
      if (previous) await deleteContractorResume(previous);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось загрузить резюме'));
    } finally {
      setResumeUploading(false);
    }
  }

  async function handleResumeRemove() {
    const path = form.resumePath;
    setForm((f) => ({ ...f, resumePath: '', resumeFileName: '' }));
    await deleteContractorResume(path);
  }

  // Фоновая попытка подтянуть аватар из Telegram после сохранения — не
  // await'ится в handleSubmit, чтобы сохранение и закрытие формы не ждали
  // стороннего запроса к t.me. Молчит, если не сработало (не команда, не
  // Telegram, приватность профиля) — см. tryAutoFillTelegramAvatarForContractor.
  function autoFillTelegramAvatar(contractor: Contractor) {
    tryAutoFillTelegramAvatarForContractor(contractor).then((updated) => {
      if (updated) setContractors((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      name: form.name,
      specialty: form.specialty,
      contact: form.contact,
      contactMethod: form.contactMethod,
      phone: form.phone,
      email: form.email,
      notes: form.notes,
      paymentTerms: form.paymentTerms,
      teamTier: form.teamTier,
      responsibilityZone: form.responsibilityZone,
      photoPath: form.photoPath,
      birthday: form.birthday,
      resumePath: form.resumePath,
      resumeFileName: form.resumeFileName,
    };
    try {
      if (editingId) {
        const updated = await updateContractor(editingId, payload);
        setContractors((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
        autoFillTelegramAvatar(updated);
      } else {
        const created = await insertContractor(payload);
        setContractors((prev) => [...prev, created]);
        autoFillTelegramAvatar(created);
      }
      setForm(emptyForm);
      setEditingId(null);
      setOpen(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить подрядчика'));
    } finally {
      setSubmitting(false);
    }
  }

  // Единственный путь к удалению — кнопка внутри формы редактирования (см.
  // ниже), а не с превью или карточки просмотра: те доступны в один клик по
  // всей карточке, и кнопка удаления там рядом слишком легко нажималась
  // случайно.
  async function handleDelete(c: Contractor) {
    if (deletingId) return;
    if (!window.confirm(`Удалить подрядчика «${c.name}»?`)) return;
    setDeletingId(c.id);
    setSubmitError(null);
    try {
      await deleteContractor(c.id);
      setContractors((prev) => prev.filter((x) => x.id !== c.id));
      setDetailId(null);
      setOpen(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось удалить подрядчика'));
    } finally {
      setDeletingId(null);
    }
  }

  const addButton = (
    <Button icon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
      Добавить подрядчика
    </Button>
  );

  return (
    <>
      <PageHeader title="Команда" action={addButton} />

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем подрядчиков...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && (
        <div className="flex flex-col gap-8">
          {tierGroups.length === 0 && <Card className="py-10 text-center text-sm text-ink-muted">Подрядчиков пока нет</Card>}
          {tierGroups.map((group) => (
            <div key={group.tier} className="flex flex-col gap-4">
              <div className="text-lg font-bold text-ink">{group.tier}</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                {group.items.map((c) => (
                  <ContractorCard key={c.id} contractor={c} onOpen={(c) => setDetailId(c.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Редактировать подрядчика' : 'Новый подрядчик'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <ContractorAvatar name={form.name || '?'} photoPath={form.photoPath} size="lg" />
            <div className="flex flex-col items-start gap-1.5">
              <label
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink hover:border-border-strong',
                  photoUploading && 'pointer-events-none opacity-50',
                )}
              >
                {photoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {photoUploading ? 'Загружаем...' : form.photoPath ? 'Заменить фото' : 'Загрузить фото'}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </label>
              {form.photoPath && !photoUploading && (
                <button
                  type="button"
                  onClick={handlePhotoRemove}
                  className="inline-flex items-center gap-1 text-xs text-ink-muted underline underline-offset-2 hover:text-danger"
                >
                  <X className="h-3 w-3" />
                  Удалить фото
                </button>
              )}
            </div>
          </div>

          <Input
            label="Имя"
            placeholder="Имя или название компании"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />

          <AddableSelect
            label="Специальность"
            placeholder="Не выбрано"
            options={knownSpecialties}
            value={form.specialty}
            onChange={(v) => setForm((f) => ({ ...f, specialty: v }))}
            addLabel="+ Добавить специальность"
            newPlaceholder="Название специальности"
          />

          <Input
            label="Зона ответственности"
            placeholder="Например: объекты в Партизанском районе"
            value={form.responsibilityZone}
            onChange={(e) => setForm((f) => ({ ...f, responsibilityZone: e.target.value }))}
          />

          <Input
            label="День рождения"
            type="date"
            value={form.birthday}
            onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Телефон"
              placeholder="+375 29 ..."
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <Input
              label="Email"
              placeholder="mail@example.com"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Контакт"
              placeholder="@username, номер телефона..."
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              required
            />
            <AddableSelect
              label="Способ связи"
              placeholder="Не выбрано"
              options={knownContactMethods}
              value={form.contactMethod}
              onChange={(v) => setForm((f) => ({ ...f, contactMethod: v }))}
              addLabel="+ Добавить способ"
              newPlaceholder="Название способа связи"
            />
          </div>
          <p className="-mt-2 text-xs text-ink-faint">
            Для Telegram укажи способ связи "Telegram" — тогда юзернейм (с @ или без) сам превратится в ссылку,
            открывающую диалог.
          </p>

          <Textarea
            label="Условия оплаты"
            placeholder="Предоплата, ставка, реквизиты..."
            rows={2}
            value={form.paymentTerms}
            onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
          />

          <Textarea
            label="Заметки"
            placeholder="Плюсы, минусы, качество работы, с какими объектами работал..."
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />

          <AddableSelect
            label="Занятость"
            placeholder="Обычный подрядчик"
            options={knownTeamTiers}
            value={form.teamTier}
            onChange={(v) => setForm((f) => ({ ...f, teamTier: v }))}
            addLabel="+ Добавить вариант"
            newPlaceholder="Название"
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Резюме</span>
            <div className="flex flex-wrap items-center gap-3">
              <label
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink hover:border-border-strong',
                  resumeUploading && 'pointer-events-none opacity-50',
                )}
              >
                {resumeUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {resumeUploading ? 'Загружаем...' : form.resumePath ? 'Заменить файл' : 'Прикрепить файл'}
                <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeChange} />
              </label>
              {form.resumePath && !resumeUploading && (
                <>
                  <span className="max-w-[12rem] truncate text-sm text-ink-muted">{form.resumeFileName}</span>
                  <button
                    type="button"
                    onClick={handleResumeRemove}
                    className="inline-flex items-center gap-1 text-xs text-ink-muted underline underline-offset-2 hover:text-danger"
                  >
                    <X className="h-3 w-3" />
                    Удалить
                  </button>
                </>
              )}
            </div>
          </div>

          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <div className="mt-2 flex items-center justify-end gap-3">
            {editingContractor && (
              <Button
                type="button"
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                disabled={deletingId === editingContractor.id}
                onClick={() => handleDelete(editingContractor)}
                className="mr-auto"
              >
                Удалить
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>

      <ContractorDetailModal contractor={detailContractor} onClose={() => setDetailId(null)} onEdit={openEditModal} />
    </>
  );
}
