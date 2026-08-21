import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { Modal } from '../components/ui/Modal';
import { setAccessProfilesCache } from '../lib/accessProfile';
import {
  fetchAccessProfiles,
  insertAccessProfile,
  updateAccessProfile,
  deleteAccessProfile,
} from '../lib/accessProfilesApi';
import type { AccessProfile } from '../data/accessProfiles';
import { ADMIN_PAGES, type PageKey } from '../data/pages';
import { cn } from '../lib/cn';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const emptyForm = { displayName: '', password: '', fullAccess: 'Да', pages: [] as PageKey[] };

function profileToForm(p: AccessProfile) {
  return {
    displayName: p.displayName,
    password: p.password,
    fullAccess: p.pages === 'all' ? 'Да' : 'Нет',
    pages: p.pages === 'all' ? [] : p.pages,
  };
}

// Список профилей доступа — у каждого свой пароль и свой список открытых
// страниц (см. data/accessProfiles.ts), редактируется прямо здесь: новые
// профили пишутся в Supabase (access_profiles) и подхватываются PasswordGate
// на следующий вход, без правки кода и деплоя. Сама страница доступна
// только владельцу: гостевой профиль без "settings" в своих pages сюда не
// попадёт (см. RequirePage), так что даже показ серым пунктом в сайдбаре
// ничего не раскрывает, кроме факта, что раздел существует.
export function Settings() {
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccessProfiles()
      .then(setProfiles)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить доступы')))
      .finally(() => setLoading(false));
  }, []);

  // Кэш в accessProfile.ts (читает PasswordGate/Sidebar/RequirePage) держим
  // в синхроне с тем, что видно на этой странице — иначе правка/удаление
  // профиля подействовали бы только после следующего входа в систему.
  function syncCache(next: AccessProfile[]) {
    setProfiles(next);
    setAccessProfilesCache(next);
  }

  const canSubmit = form.displayName.trim() && form.password.trim() && (form.fullAccess === 'Да' || form.pages.length > 0);

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setSubmitError(null);
    setOpen(true);
  }

  function openEditModal(p: AccessProfile) {
    setEditingId(p.id);
    setForm(profileToForm(p));
    setSubmitError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      displayName: form.displayName.trim(),
      password: form.password.trim(),
      pages: (form.fullAccess === 'Да' ? 'all' : form.pages) as AccessProfile['pages'],
    };
    try {
      if (editingId) {
        const updated = await updateAccessProfile(editingId, payload);
        syncCache(profiles.map((p) => (p.id === editingId ? updated : p)));
      } else {
        const created = await insertAccessProfile(payload);
        syncCache([...profiles, created]);
      }
      setForm(emptyForm);
      setEditingId(null);
      setOpen(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить профиль'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(p: AccessProfile) {
    if (deletingId) return;
    if (profiles.length <= 1) {
      setDeleteError('Нельзя удалить последний профиль — это заблокирует вход всем.');
      return;
    }
    if (!window.confirm(`Удалить профиль «${p.displayName}»? Он больше не сможет войти.`)) return;
    setDeletingId(p.id);
    setDeleteError(null);
    try {
      await deleteAccessProfile(p.id);
      syncCache(profiles.filter((x) => x.id !== p.id));
    } catch (err) {
      setDeleteError(errorMessage(err, 'Не удалось удалить профиль'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Настройки"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
            Добавить профиль
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          Доступы в платформу — у каждого свой пароль и свой список открытых страниц. Новый доступ подхватится у
          человека при следующем входе.
        </p>

        {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем доступы...
          </Card>
        )}
        {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

        {!loading &&
          !loadError &&
          profiles.map((profile) => (
            <Card key={profile.id} className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-lg font-bold text-ink">{profile.displayName}</span>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-surface-muted px-3 py-1 font-mono text-sm text-ink">
                    {profile.password}
                  </span>
                  <button
                    type="button"
                    onClick={() => openEditModal(profile)}
                    aria-label="Редактировать профиль"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(profile)}
                    disabled={deletingId === profile.id}
                    aria-label="Удалить профиль"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {profile.pages === 'all' ? (
                <span className="w-fit rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  Полный доступ ко всем страницам
                </span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {profile.pages.map((key) => (
                    <span
                      key={key}
                      className="rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success"
                    >
                      {ADMIN_PAGES.find((p) => p.key === key)?.label ?? key}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Редактировать профиль' : 'Новый профиль'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Имя"
            placeholder="Например, Иван Иванов"
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            required
          />
          <Input
            label="Пароль"
            placeholder="Например, 1234"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
          />

          <ToggleGroup
            label="Полный доступ ко всем страницам"
            options={['Да', 'Нет']}
            value={form.fullAccess}
            onChange={(v) => setForm((f) => ({ ...f, fullAccess: v }))}
          />

          {form.fullAccess === 'Нет' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-muted">Открытые страницы</span>
              <div className="flex flex-wrap gap-2">
                {ADMIN_PAGES.map((page) => {
                  const selected = form.pages.includes(page.key);
                  return (
                    <button
                      key={page.key}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          pages: selected ? f.pages.filter((x) => x !== page.key) : [...f.pages, page.key],
                        }))
                      }
                      className={cn(
                        'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                        selected
                          ? 'border-primary bg-primary-soft text-primary'
                          : 'border-border bg-surface-muted text-ink-muted',
                      )}
                    >
                      {page.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
