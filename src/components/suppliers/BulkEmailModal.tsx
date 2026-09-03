import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Send, TriangleAlert } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { cn } from '../../lib/cn';
import type { SupplierRequest, SupplierOffer } from '../../data/supplierResearch';
import type { SupplierOfferEmail } from '../../data/supplierOfferEmails';
import { sendSupplierOfferEmail } from '../../lib/supplierOfferEmailsApi';
import type { EmailTemplate } from '../../data/emailTemplates';
import { renderEmailTemplate } from '../../lib/emailTemplates';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// EMAIL_CORRESPONDENCE_PLAN.md, этап 4 — владелец, 2026-09-03: "чтобы мы не
// попали в спам за массовую отправку... домен новый". Пауза между письмами
// намеренно не меньше 3-5с (не просто последовательность через for..of) —
// голый await шлёт настолько быстро, насколько успевает сеть, это тоже
// похоже на бота. Порог баннера-предупреждения — не жёсткий лимит, просто
// честная подсказка, финальное число за владельцем.
const SEND_DELAY_MS = 4000;
const BULK_WARNING_THRESHOLD = 8;

interface Recipient {
  offer: SupplierOffer;
  alreadySentCount: number;
}

// Модалка рассылки первого письма всем поставщикам запроса разом — кнопка
// "Написать всем" на карточке запроса (Ресерч), рядом с "Найти в сети".
// Персонализация через плейсхолдеры (этап 3) — не довесок, а часть защиты
// от спам-эвристики "identical bulk": 20 писем формально разные. Точечные
// правки хранятся в overrides и переживают смену шаблона только для той
// строки, которую тронули руками — остальные продолжают следовать за
// выбранным шаблоном.
export function BulkEmailModal({
  request,
  offers,
  emails,
  templates,
  onEmailSent,
  onClose,
}: {
  request: SupplierRequest;
  offers: SupplierOffer[];
  emails: SupplierOfferEmail[];
  templates: EmailTemplate[];
  onEmailSent: (email: SupplierOfferEmail) => void;
  onClose: () => void;
}) {
  const recipients = useMemo<Recipient[]>(
    () =>
      offers
        .filter((o) => o.email.trim())
        .map((o) => ({
          offer: o,
          alreadySentCount: emails.filter((e) => e.offerId === o.id && e.direction === 'out').length,
        })),
    [offers, emails],
  );

  const orderedTemplates = useMemo(() => {
    const own = templates.filter((t) => t.requestId === request.id);
    const shared = templates.filter((t) => t.requestId !== request.id);
    return [...own, ...shared];
  }, [templates, request.id]);

  const [templateId, setTemplateId] = useState(orderedTemplates[0]?.id ?? '');
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(recipients.filter((r) => r.alreadySentCount === 0).map((r) => r.offer.id)),
  );
  const [overrides, setOverrides] = useState<Record<string, { subject: string; body: string }>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const template = templates.find((t) => t.id === templateId) ?? null;

  function contentFor(offer: SupplierOffer): { subject: string; body: string } {
    const override = overrides[offer.id];
    if (override) return override;
    if (!template) return { subject: '', body: '' };
    return renderEmailTemplate(template, { offer, request });
  }

  function toggleChecked(offerId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(offerId)) next.delete(offerId);
      else next.add(offerId);
      return next;
    });
  }

  function updateOverride(offer: SupplierOffer, patch: Partial<{ subject: string; body: string }>) {
    setOverrides((prev) => ({
      ...prev,
      [offer.id]: { ...(prev[offer.id] ?? contentFor(offer)), ...patch },
    }));
  }

  const checkedRecipients = recipients.filter((r) => checked.has(r.offer.id));
  const canSend = !!template && checkedRecipients.length > 0 && !sending && !done;

  // Последовательно, с паузой между письмами (не Promise.all и не
  // задержка-в-ноль) — см. комментарий у SEND_DELAY_MS. Одна ошибка не
  // прерывает рассылку остальным — собираем по offerId, показываем в конце.
  async function handleSendAll() {
    if (!template || checkedRecipients.length === 0 || sending) return;
    setSending(true);
    setSendErrors({});
    setProgress({ sent: 0, total: checkedRecipients.length });
    for (let i = 0; i < checkedRecipients.length; i++) {
      const { offer } = checkedRecipients[i];
      const { subject, body } = contentFor(offer);
      try {
        const email = await sendSupplierOfferEmail({ offerId: offer.id, toAddress: offer.email, subject, body });
        onEmailSent(email);
      } catch (err) {
        setSendErrors((prev) => ({ ...prev, [offer.id]: errorMessage(err, 'Не удалось отправить') }));
      }
      setProgress({ sent: i + 1, total: checkedRecipients.length });
      if (i < checkedRecipients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
      }
    }
    setSending(false);
    setDone(true);
  }

  const errorCount = Object.keys(sendErrors).length;

  return (
    <Modal open onClose={onClose} title={`Написать всем: ${request.title}`}>
      <div className="flex flex-col gap-4">
        {recipients.length === 0 ? (
          <p className="text-sm text-ink-faint">У предложений этого запроса нет email — писать некому.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-muted">Шаблон (обязателен)</span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={sending || done}
                className="rounded-control border border-transparent bg-surface-muted px-4 py-2.5 text-sm text-ink outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">Выберите шаблон...</option>
                {orderedTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {orderedTemplates.length === 0 && (
                <p className="text-xs text-danger">Нет ни одного шаблона — сначала создайте его в разделе «Шаблоны».</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {recipients.map(({ offer, alreadySentCount }) => {
                const isChecked = checked.has(offer.id);
                const isExpanded = expandedId === offer.id;
                const content = contentFor(offer);
                const error = sendErrors[offer.id];
                return (
                  <div key={offer.id} className="rounded-control border border-border">
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleChecked(offer.id)}
                        disabled={sending || done}
                        className="h-4 w-4 shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{offer.name}</span>
                      {alreadySentCount > 0 && (
                        <span className="shrink-0 text-xs text-ink-faint">Уже отправляли {alreadySentCount} писем</span>
                      )}
                      {error && <span className="shrink-0 text-xs text-danger">{error}</span>}
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : offer.id)}
                        aria-label={isExpanded ? 'Свернуть превью' : 'Развернуть превью'}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-primary"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="flex flex-col gap-2 border-t border-border px-3 py-3">
                        <Input
                          label="Тема"
                          value={content.subject}
                          onChange={(e) => updateOverride(offer, { subject: e.target.value })}
                          disabled={sending || done}
                        />
                        <Textarea
                          label="Текст"
                          rows={4}
                          value={content.body}
                          onChange={(e) => updateOverride(offer, { body: e.target.value })}
                          disabled={sending || done}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {checkedRecipients.length > BULK_WARNING_THRESHOLD && (
              <div className="flex items-start gap-2 rounded-control border border-warning/30 bg-warning-bg px-3 py-2.5 text-sm text-warning">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Домен redevelopment.pro ещё нарабатывает репутацию у почтовых провайдеров — для лучшей
                  доставляемости на старте рекомендуем рассылать небольшими партиями (5–10 писем), а не всё сразу.
                </span>
              </div>
            )}

            {progress && (
              <p className={cn('text-sm', done ? 'text-ink-muted' : 'text-ink')}>
                {sending ? 'Отправляем' : 'Отправлено'}: {progress.sent} из {progress.total}
                {sending && ' — не закрывайте вкладку'}
              </p>
            )}

            {done && errorCount === 0 && <p className="text-sm text-success">Все письма отправлены.</p>}
            {done && errorCount > 0 && (
              <p className="text-sm text-danger">
                Не удалось отправить {errorCount} из {checkedRecipients.length} — причины указаны у получателей выше.
              </p>
            )}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onClose} disabled={sending}>
                {done ? 'Закрыть' : 'Отмена'}
              </Button>
              {!done && (
                <Button type="button" icon={<Send className="h-4 w-4" />} onClick={handleSendAll} disabled={!canSend}>
                  {sending ? 'Отправляем...' : `Отправить ${checkedRecipients.length || ''} писем`.trim()}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
