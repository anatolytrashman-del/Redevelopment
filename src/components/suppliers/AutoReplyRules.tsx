import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Bot, Loader2, GraduationCap } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { cn } from '../../lib/cn';
import type {
  AutoReplyKind,
  AutoReplyMode,
  AutoReplySource,
  EmailAutoReplyRule,
  EmailAutoReplyRuleStats,
  EmailAutoReplySettings,
} from '../../data/emailAutoReply';
import { autoReplyKindLabel, autoReplyModeLabel } from '../../data/emailAutoReply';
import type { SupplierRequest } from '../../data/supplierResearch';
import {
  insertEmailAutoReplyRule,
  updateEmailAutoReplyRule,
  deleteEmailAutoReplyRule,
  updateEmailAutoReplySettings,
} from '../../lib/emailAutoReplyApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const NO_REQUEST = 'Любая категория';

// Те же плейсхолдеры, что у шаблонов писем (lib/emailTemplates.ts) —
// автоответ подставляет их так же, никакого второго синтаксиса.
const PLACEHOLDER_HINT = 'Доступны: {компания}, {запрос}, {материалы}, {контакт}';

interface RuleFormState {
  name: string;
  criteria: string;
  replyKind: AutoReplyKind;
  replySubject: string;
  replyBody: string;
  mode: AutoReplyMode;
  requestId: string;
  enabled: boolean;
  priority: string;
  source: AutoReplySource;
  originEmailId: string | null;
  examples: string;
}

function emptyForm(): RuleFormState {
  return {
    name: '',
    criteria: '',
    replyKind: 'template',
    replySubject: '',
    replyBody: '',
    mode: 'draft',
    requestId: '',
    enabled: true,
    priority: '100',
    source: 'manual',
    originEmailId: null,
    examples: '',
  };
}

function ruleToForm(r: EmailAutoReplyRule): RuleFormState {
  return {
    name: r.name,
    criteria: r.criteria,
    replyKind: r.replyKind,
    replySubject: r.replySubject,
    replyBody: r.replyBody,
    mode: r.mode,
    requestId: r.requestId ?? '',
    enabled: r.enabled,
    priority: String(r.priority),
    source: r.source,
    originEmailId: r.originEmailId,
    examples: r.examples,
  };
}

// Две кнопки-переключателя в строку (режим ответа, вид текста) — свой
// маленький компонент, а не ui/ToggleGroup: тот занимает всю ширину блока
// и рассчитан на вкладки страницы, здесь же это поле формы с подписью.
function OptionRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-ink-muted">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-control border px-3 py-2 text-left text-sm',
              value === o.value ? 'border-primary bg-primary/5 text-ink' : 'border-border text-ink-muted hover:text-ink',
            )}
          >
            <span className="font-medium">{o.label}</span>
            {o.hint && <span className="text-xs text-ink-faint">{o.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function RuleFormModal({
  open,
  rule,
  requests,
  onClose,
  onSaved,
}: {
  open: boolean;
  rule: EmailAutoReplyRule | null;
  requests: SupplierRequest[];
  onClose: () => void;
  onSaved: (r: EmailAutoReplyRule) => void;
}) {
  const [form, setForm] = useState<RuleFormState>(() => (rule ? ruleToForm(rule) : emptyForm()));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Модалка остаётся смонтированной между открытиями (родитель переключает
  // только open) — без этого форма помнила бы прошлое правило, тот же
  // случай, что и в TemplateFormModal.
  useEffect(() => {
    if (!open) return;
    setForm(rule ? ruleToForm(rule) : emptyForm());
    setSubmitError(null);
  }, [open, rule]);

  if (!open) return null;

  const canSubmit = form.name.trim().length > 0 && form.criteria.trim().length > 0 && form.replyBody.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const parsedPriority = Number.parseInt(form.priority, 10);
    const payload = {
      name: form.name.trim(),
      criteria: form.criteria.trim(),
      replyKind: form.replyKind,
      replySubject: form.replySubject,
      replyBody: form.replyBody,
      mode: form.mode,
      requestId: form.requestId || null,
      enabled: form.enabled,
      priority: Number.isFinite(parsedPriority) ? parsedPriority : 100,
      source: form.source,
      originEmailId: form.originEmailId,
      examples: form.examples,
    };
    try {
      const saved = rule ? await updateEmailAutoReplyRule(rule.id, payload) : await insertEmailAutoReplyRule(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить ситуацию'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={rule ? 'Редактировать ситуацию' : 'Новая ситуация'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Название ситуации"
          placeholder="Например, Прислали счёт или КП"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          autoFocus
        />

        <div className="flex flex-col gap-1.5">
          <Textarea
            label="Когда применять"
            rows={3}
            placeholder="Опишите словами, по каким признакам понять, что письмо относится к этой ситуации. Например: поставщик прислал счёт или коммерческое предложение во вложении и не задаёт вопросов."
            value={form.criteria}
            onChange={(e) => setForm((f) => ({ ...f, criteria: e.target.value }))}
            required
          />
          <p className="text-xs text-ink-faint">
            Этот текст читает ИИ-закупщик — пишите так, как объяснили бы человеку. Если под письмо не подошла ни одна
            ситуация или ИИ сомневается, он не отвечает и оставляет письмо вам.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Textarea
            label="Как это звучит у поставщиков"
            rows={3}
            placeholder="По одному примеру в строке. Заполняется само: когда ситуация не узнала очередной вариант вопроса, разбор почты дописывает сюда живую формулировку."
            value={form.examples}
            onChange={(e) => setForm((f) => ({ ...f, examples: e.target.value }))}
          />
          <p className="text-xs text-ink-faint">
            Память ситуации. Чем больше здесь реальных формулировок, тем увереннее ИИ-закупщик узнаёт тот же вопрос,
            заданный другими словами. Строку можно убрать руками, если она уводит не туда.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-muted">Категория</span>
          <select
            value={form.requestId}
            onChange={(e) => setForm((f) => ({ ...f, requestId: e.target.value }))}
            className="rounded-control border border-transparent bg-surface-muted px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
          >
            <option value="">{NO_REQUEST}</option>
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>

        <OptionRow<AutoReplyKind>
          label="Что отвечаем"
          value={form.replyKind}
          onChange={(v) => setForm((f) => ({ ...f, replyKind: v }))}
          options={[
            { value: 'template', label: autoReplyKindLabel.template, hint: 'Уходит ровно ваш текст' },
            { value: 'ai', label: autoReplyKindLabel.ai, hint: 'Текст под конкретное письмо' },
          ]}
        />

        <Input
          label="Тема ответа"
          placeholder="Пусто — ответ уйдёт с темой исходного письма (Re: ...)"
          value={form.replySubject}
          onChange={(e) => setForm((f) => ({ ...f, replySubject: e.target.value }))}
        />

        <div className="flex flex-col gap-1.5">
          <Textarea
            label={form.replyKind === 'ai' ? 'Инструкция для ИИ' : 'Текст ответа'}
            rows={7}
            placeholder={
              form.replyKind === 'ai'
                ? 'Что должно быть в ответе: поблагодарить за счёт, уточнить срок поставки и условия оплаты, не называть наши цены.'
                : 'Добрый день!\n\nСпасибо, счёт получили — передали на рассмотрение...'
            }
            value={form.replyBody}
            onChange={(e) => setForm((f) => ({ ...f, replyBody: e.target.value }))}
            required
          />
          <p className="text-xs text-ink-faint">
            {form.replyKind === 'ai'
              ? 'ИИ напишет ответ сам по этой инструкции — только текст по делу.'
              : PLACEHOLDER_HINT}
            {' '}Приветствие, подпись и цитату переписки добавлять не нужно — они подставляются сами.
          </p>
        </div>

        <OptionRow<AutoReplyMode>
          label="Режим"
          value={form.mode}
          onChange={(v) => setForm((f) => ({ ...f, mode: v }))}
          options={[
            { value: 'draft', label: autoReplyModeLabel.draft, hint: 'Ответ ждёт вашей кнопки' },
            { value: 'auto', label: autoReplyModeLabel.auto, hint: 'Уходит без подтверждения' },
          ]}
        />

        <div className="flex flex-wrap items-end gap-4">
          <div className="w-32">
            <Input
              label="Порядок проверки"
              type="number"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 pb-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="h-4 w-4 accent-primary"
            />
            Ситуация включена
          </label>
        </div>
        <p className="-mt-2 text-xs text-ink-faint">
          Чем меньше число, тем раньше проверяется ситуация. Если письмо подходит сразу под две — сработает та, что выше.
        </p>

        {submitError && <p className="text-sm text-danger">{submitError}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting}>
            {submitting ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Настройка автоответов — кнопка "Автоответы" в шапке вкладки "Письма"
// (Suppliers.tsx), рядом с "Шаблонами".
//
// Само приложение письма не разбирает и ни на что не отвечает: раз в час
// приходит Claude-сессия (Routine владельца, как проверка Sentry), читает
// эти правила и решает по каждому свежему входящему письму. Поэтому здесь
// нет ни кнопки "проверить сейчас", ни статуса воркера — показывать было
// бы нечего, а обещать мгновенную реакцию нельзя.
export function AutoReplyRulesModal({
  open,
  rules,
  settings,
  requests,
  stats,
  loading,
  onClose,
  onRulesChange,
  onSettingsChange,
}: {
  open: boolean;
  rules: EmailAutoReplyRule[];
  settings: EmailAutoReplySettings;
  requests: SupplierRequest[];
  stats: EmailAutoReplyRuleStats[];
  loading: boolean;
  onClose: () => void;
  onRulesChange: (rules: EmailAutoReplyRule[]) => void;
  onSettingsChange: (settings: EmailAutoReplySettings) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmailAutoReplyRule | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  if (!open) return null;

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(r: EmailAutoReplyRule) {
    setEditing(r);
    setFormOpen(true);
  }

  function handleSaved(saved: EmailAutoReplyRule) {
    const next = rules.some((r) => r.id === saved.id) ? rules.map((r) => (r.id === saved.id ? saved : r)) : [...rules, saved];
    onRulesChange([...next].sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt)));
  }

  async function handleDelete(r: EmailAutoReplyRule) {
    if (deletingId) return;
    if (!window.confirm(`Удалить ситуацию «${r.name}»?`)) return;
    setDeletingId(r.id);
    setActionError(null);
    try {
      await deleteEmailAutoReplyRule(r.id);
      onRulesChange(rules.filter((x) => x.id !== r.id));
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось удалить ситуацию'));
    } finally {
      setDeletingId(null);
    }
  }

  async function saveSettings(next: EmailAutoReplySettings) {
    setSavingSettings(true);
    setActionError(null);
    // Показываем новое состояние сразу — тумблер не должен «залипать» на
    // время запроса; при ошибке возвращаем прежнее значение.
    onSettingsChange(next);
    try {
      onSettingsChange(await updateEmailAutoReplySettings(next));
    } catch (err) {
      onSettingsChange(settings);
      setActionError(errorMessage(err, 'Не удалось сохранить настройку'));
    } finally {
      setSavingSettings(false);
    }
  }

  function requestTitle(requestId: string | null): string {
    if (!requestId) return NO_REQUEST;
    return requests.find((r) => r.id === requestId)?.title ?? NO_REQUEST;
  }

  // Строка вида «сработала 5 раз · 3 одобрены как есть · 1 правка». Считаем
  // только то, что уже случилось: у новой ситуации строки нет вовсе, чтобы не
  // показывать частокол нулей.
  function statsLine(ruleId: string): string | null {
    const s = stats.find((x) => x.ruleId === ruleId);
    if (!s || s.firedTotal === 0) return null;
    const parts = [`сработала ${s.firedTotal} раз`];
    if (s.autoSent > 0) parts.push(`${s.autoSent} ушло само`);
    if (s.approvedAsIs > 0) parts.push(`${s.approvedAsIs} одобрено как есть`);
    if (s.edited > 0) parts.push(`${s.edited} с правкой`);
    if (s.rejected > 0) parts.push(`${s.rejected} отклонено`);
    return parts.join(' · ');
  }

  const autoCount = rules.filter((r) => r.enabled && r.mode === 'auto').length;
  const learnedCount = rules.filter((r) => r.source === 'learned').length;

  return (
    <>
      <Modal open onClose={onClose} title="Автоответы на письма">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-control border border-border px-3 py-3">
            <label className="flex items-start gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={settings.enabled}
                disabled={savingSettings}
                onChange={(e) => saveSettings({ ...settings, enabled: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="font-medium">Автоответы включены</span>
                <span className="block text-xs text-ink-faint">
                  Выключено — ИИ-закупщик не трогает почту вообще, ни ответов, ни черновиков.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <span>Не отвечать раньше, чем через</span>
              <div className="w-24">
                <Input
                  type="number"
                  min={0}
                  value={String(settings.minDelayMinutes)}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    onSettingsChange({ ...settings, minDelayMinutes: Number.isFinite(parsed) ? parsed : 0 });
                  }}
                  onBlur={() => saveSettings(settings)}
                />
              </div>
              <span>минут после получения письма</span>
            </div>
            <label className="flex items-start gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={settings.followupsEnabled}
                disabled={savingSettings}
                onChange={(e) => saveSettings({ ...settings, followupsEnabled: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="font-medium">Напоминать молчащим поставщикам</span>
                <span className="block text-xs text-ink-faint">
                  Если поставщик не ответил за срок, заданный у категории («Ждём ответ N дней»), ИИ-закупщик сам
                  отправляет напоминание № 1, через такой же срок — № 2, а ещё через столько же помечает карточку
                  «без ответа». Тексты — в «Шаблонах писем», у них тип «Напоминание». Тем, кто уже ответил, прислал
                  счёт или лежит в стоп-листе, не пишем.
                </span>
              </span>
            </label>
            <div className="w-full">
              <Input
                label="Подпись"
                value={settings.signature}
                onChange={(e) => onSettingsChange({ ...settings, signature: e.target.value })}
                onBlur={() => saveSettings(settings)}
              />
            </div>
            <p className="text-xs text-ink-faint">
              Почта проверяется раз в час. Письма, на которые вы уже ответили сами, ИИ не трогает. К каждому ответу
              автоматически добавляются: «Здравствуйте.» — если сегодня этому поставщику ещё не писали, подпись из
              поля выше и вся история переписки под спойлером. Дублировать их в текстах ситуаций не нужно.
            </p>
          </div>

          {settings.enabled && autoCount > 0 && (
            <p className="rounded-control bg-surface-muted px-3 py-2 text-xs text-ink-muted">
              {autoCount === 1 ? 'Одна ситуация отвечает' : `${autoCount} ситуаций отвечают`} без подтверждения — такие
              письма уходят поставщику сразу.
            </p>
          )}

          <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} className="w-fit" onClick={openAdd}>
            Новая ситуация
          </Button>

          {actionError && <p className="text-sm text-danger">{actionError}</p>}

          {loading && (
            <p className="flex items-center gap-2 text-sm text-ink-faint">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем ситуации...
            </p>
          )}

          {!loading && rules.length === 0 && (
            <p className="text-sm text-ink-faint">
              Ситуаций пока нет. Опишите повторяющийся случай — например, «прислали счёт» — и что на него отвечать.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {rules.map((r) => (
              <div
                key={r.id}
                className={cn(
                  'flex items-start justify-between gap-3 rounded-control border px-3 py-2.5',
                  r.enabled ? 'border-border' : 'border-border/60 opacity-60',
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{r.name}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        r.mode === 'auto' ? 'bg-warning/15 text-warning' : 'bg-surface-muted text-ink-muted',
                      )}
                    >
                      {r.mode === 'auto' ? 'Автоматически' : 'Черновик'}
                    </span>
                    {r.source === 'learned' && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        <GraduationCap className="h-3 w-3" />
                        выучена
                      </span>
                    )}
                    {!r.enabled && <span className="text-[11px] text-ink-faint">выключена</span>}
                  </div>
                  <div className="text-xs text-ink-faint">
                    {requestTitle(r.requestId)} · {autoReplyKindLabel[r.replyKind]}
                    {statsLine(r.id) && <> · {statsLine(r.id)}</>}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-ink-muted">{r.criteria}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    aria-label="Редактировать ситуацию"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(r)}
                    disabled={deletingId === r.id}
                    aria-label="Удалить ситуацию"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="flex items-start gap-2 text-xs text-ink-faint">
            <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Черновики ИИ-закупщика появляются в самой переписке с поставщиком — с кнопками «Отправить», «Изменить» и
            «Отклонить».
          </p>
          <p className="flex items-start gap-2 text-xs text-ink-faint">
            <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Письма, на которые ни одна ситуация не подошла, раз в час приходят вам отдельным списком в Клод — с готовым
            вариантом ответа на каждое. Из ваших ответов там же заводятся новые ситуации: они появляются в этом списке
            с пометкой «выучена» и сначала работают черновиками.
            {learnedCount > 0 && ` Сейчас таких ${learnedCount}.`}
          </p>
        </div>
      </Modal>

      <RuleFormModal open={formOpen} rule={editing} requests={requests} onClose={() => setFormOpen(false)} onSaved={handleSaved} />
    </>
  );
}
