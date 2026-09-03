import { useEffect, useMemo, useState } from 'react';
import { Mail, Paperclip, Send } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { cn } from '../../lib/cn';
import type { SupplierRequest, SupplierOffer } from '../../data/supplierResearch';
import { supplierOfferEmailAddress } from '../../data/supplierResearch';
import type { SupplierOfferEmail } from '../../data/supplierOfferEmails';
import { sendSupplierOfferEmail } from '../../lib/supplierOfferEmailsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Лента писем + форма ответа — общий компонент для полноэкранной вкладки
// "Переписка" и для OfferEmailModal (карточка отдельного предложения), см.
// EMAIL_CORRESPONDENCE_PLAN.md, этап 2: "вынести разметку ленты в общий
// компонент, чтобы не было двух копий". Данные (emails) и их обновление —
// снаружи (в Suppliers.tsx, единый источник правды на всю страницу), сама
// отправка — здесь, единственное место в коде, которое реально шлёт письмо
// по предложению.
export function EmailThread({
  offer,
  emails,
  onEmailSent,
}: {
  offer: SupplierOffer;
  emails: SupplierOfferEmail[];
  onEmailSent: (email: SupplierOfferEmail) => void;
}) {
  const [subject, setSubject] = useState(`Запрос цены: ${offer.name}`);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Тема по умолчанию завязана на конкретное предложение — при переключении
  // между тредами (вкладка "Переписка") нужно её пересчитать, иначе останется
  // тема предыдущего поставщика. Текст письма НЕ сбрасываем ничем похожим —
  // тут сброс безопасен (новый тред = чистый черновик), а вот случайно
  // потерять напечатанное было бы плохо, если бы условие сработало лишний раз.
  useEffect(() => {
    setSubject(`Запрос цены: ${offer.name}`);
    setBody('');
    setSendError(null);
  }, [offer.id]);

  async function handleSend() {
    if (!offer.email || !body.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const email = await sendSupplierOfferEmail({ offerId: offer.id, toAddress: offer.email, subject, body });
      onEmailSent(email);
      setBody('');
    } catch (err) {
      setSendError(errorMessage(err, 'Не удалось отправить письмо'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-sm text-ink-muted">
        <span>Email: {offer.email || 'не указан'}</span>
        <span>Адрес для переписки: {supplierOfferEmailAddress(offer.id)}</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-ink">Переписка</span>
        {emails.length === 0 && <p className="text-sm text-ink-faint">Писем пока нет.</p>}
        {emails.length > 0 && (
          <div className="flex flex-col gap-2">
            {emails.map((e) => (
              <div
                key={e.id}
                className={cn(
                  'flex flex-col gap-1 rounded-control p-3 text-sm',
                  e.direction === 'out' ? 'ml-6 bg-primary-soft' : 'mr-6 bg-surface-muted',
                )}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-ink-faint">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {e.direction === 'out' ? 'Отправлено' : 'Получено'}
                  </span>
                  <span>{new Date(e.createdAt).toLocaleString('ru-RU')}</span>
                </div>
                {e.subject && <div className="font-semibold text-ink">{e.subject}</div>}
                <div className="whitespace-pre-wrap text-ink">{e.body}</div>
                {e.files.length > 0 && (
                  <div className="mt-1 flex flex-col gap-1">
                    {e.files.map((f, i) => (
                      <a
                        key={i}
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-primary hover:underline"
                      >
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                        <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!offer.email ? (
        <p className="text-sm text-ink-faint">У предложения не указан email — добавьте его через «Редактировать», чтобы писать отсюда.</p>
      ) : (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Input label="Тема" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea label="Сообщение" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          {sendError && <p className="text-sm text-danger">{sendError}</p>}
          <Button
            type="button"
            icon={<Send className="h-4 w-4" />}
            className="w-fit self-end"
            onClick={handleSend}
            disabled={!body.trim() || sending}
          >
            {sending ? 'Отправляем...' : 'Отправить'}
          </Button>
        </div>
      )}
    </div>
  );
}

type ThreadStatus = 'unread' | 'sent' | 'replied' | 'none';

// Владелец не хранится нигде отдельно — статус всегда пересчитывается из
// самой переписки (см. EMAIL_CORRESPONDENCE_PLAN.md, этап 2): "Не писали"
// (писем нет), "Отправлено" (есть исходящее, ответа нет), "Ответили"
// (последнее письмо входящее — unread красным счётчиком поверх статуса,
// если ещё не открывали тред).
function threadStatus(emails: SupplierOfferEmail[]): { status: ThreadStatus; unreadCount: number } {
  const unreadCount = emails.filter((e) => e.direction === 'in' && !e.readAt).length;
  if (emails.length === 0) return { status: 'none', unreadCount: 0 };
  const last = emails[emails.length - 1];
  if (unreadCount > 0) return { status: 'unread', unreadCount };
  return { status: last.direction === 'in' ? 'replied' : 'sent', unreadCount: 0 };
}

const STATUS_LABEL: Record<ThreadStatus, string> = {
  none: 'Не писали',
  sent: 'Отправлено',
  replied: 'Ответили',
  unread: 'Ответили',
};

const STATUS_CLASS: Record<ThreadStatus, string> = {
  none: 'text-ink-faint',
  sent: 'text-ink-muted',
  replied: 'text-success',
  unread: 'text-success',
};

interface RequestGroup {
  request: SupplierRequest;
  offers: { offer: SupplierOffer; emails: SupplierOfferEmail[] }[];
}

// Слева — дерево Запрос → Поставщик (только те, у кого есть email — писать
// больше некому), справа — тред выбранного. Владелец, 2026-09-03: "точно
// нужна группировка по подрядчику, метка с категорией... ну и сама
// группировка по этому тегу" — категория тут это сам запрос Ресерча
// (согласовано отдельно, см. EMAIL_CORRESPONDENCE_PLAN.md п.0), второго
// поля-тега не заводили.
export function SupplierCorrespondenceTab({
  requests,
  offers,
  emails,
  onEmailSent,
  onMarkRead,
}: {
  requests: SupplierRequest[];
  offers: SupplierOffer[];
  emails: SupplierOfferEmail[];
  onEmailSent: (email: SupplierOfferEmail) => void;
  onMarkRead: (offerId: string) => void;
}) {
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);

  const groups = useMemo<RequestGroup[]>(() => {
    const byRequest = new Map<string, RequestGroup>();
    for (const request of requests) {
      byRequest.set(request.id, { request, offers: [] });
    }
    for (const offer of offers) {
      if (!offer.email) continue; // некому писать — не показываем
      const group = byRequest.get(offer.requestId);
      if (!group) continue;
      const offerEmails = emails.filter((e) => e.offerId === offer.id);
      group.offers.push({ offer, emails: offerEmails });
    }
    return [...byRequest.values()]
      .filter((g) => g.offers.length > 0)
      .map((g) => ({
        ...g,
        offers: g.offers.sort((a, b) => {
          const sa = threadStatus(a.emails);
          const sb = threadStatus(b.emails);
          if (sa.unreadCount !== sb.unreadCount) return sb.unreadCount - sa.unreadCount;
          const lastA = a.emails[a.emails.length - 1]?.createdAt ?? '';
          const lastB = b.emails[b.emails.length - 1]?.createdAt ?? '';
          if (lastA !== lastB) return lastB.localeCompare(lastA);
          return a.offer.name.localeCompare(b.offer.name, 'ru');
        }),
      }));
  }, [requests, offers, emails]);

  const selected = useMemo(() => {
    if (!selectedOfferId) return null;
    for (const group of groups) {
      const found = group.offers.find((x) => x.offer.id === selectedOfferId);
      if (found) return { ...found, request: group.request };
    }
    return null;
  }, [groups, selectedOfferId]);

  function selectOffer(offerId: string) {
    setSelectedOfferId(offerId);
    onMarkRead(offerId);
  }

  if (groups.length === 0) {
    return (
      <Card className="py-10 text-center text-sm text-ink-muted">
        Пока не с кем переписываться — у предложений в Ресерче ещё нет email, или запросов вовсе нет.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex flex-col gap-4 lg:w-80 lg:shrink-0">
        {groups.map((group) => (
          <div key={group.request.id} className="flex flex-col gap-1.5">
            <span className="w-fit rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
              {group.request.title}
            </span>
            <div className="flex flex-col gap-1">
              {group.offers.map(({ offer, emails: offerEmails }) => {
                const { status, unreadCount } = threadStatus(offerEmails);
                const isSelected = selectedOfferId === offer.id;
                return (
                  <button
                    key={offer.id}
                    type="button"
                    onClick={() => selectOffer(offer.id)}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-control border px-3 py-2 text-left text-sm transition-colors',
                      isSelected ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:border-border-strong',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{offer.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                          {unreadCount}
                        </span>
                      )}
                      <span className={cn('text-xs', STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Card className="flex-1 p-5">
        {!selected ? (
          <p className="text-sm text-ink-faint">Выберите поставщика слева, чтобы открыть переписку.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-ink">{selected.offer.name}</span>
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                {selected.request.title}
              </span>
            </div>
            <EmailThread offer={selected.offer} emails={selected.emails} onEmailSent={onEmailSent} />
          </div>
        )}
      </Card>
    </div>
  );
}

// Общий счётчик непрочитанных по всей переписке — подпись вкладки
// "Переписка (N)" в ToggleGroup и, при желании, бейдж рядом с ним.
export function countUnreadSupplierEmails(emails: SupplierOfferEmail[]): number {
  return emails.filter((e) => e.direction === 'in' && !e.readAt).length;
}
