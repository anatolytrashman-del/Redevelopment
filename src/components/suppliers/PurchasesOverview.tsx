import type { ReactNode } from 'react';
import { ArrowRight, Mail, Package, FileSpreadsheet } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';
import { currencySymbols, type Currency } from '../../data/transactions';
import type { SupplierQuote } from '../../data/supplierQuotes';
import type { UnmatchedIncomingEmail } from '../../data/unmatchedIncomingEmails';
import type { PurchaseDelivery } from '../../data/purchaseDeliveries';
import { PURCHASE_DELIVERY_STATUS_LABELS } from '../../data/purchaseDeliveries';
import type { PurchaseOrder } from '../../data/purchaseOrders';
import type { SupplierOffer } from '../../data/supplierResearch';

// Стартовый экран модуля закупок (2026-10-09): не дашборд, а пара
// минималистичных уведомлений — новые КП, неразобранные письма, ближайшие
// поставки. Первая вкладка вместо редкоиспользуемой «Ведомости».

const NEW_QUOTE_DAYS = 7;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function formatMoney(price: number, currency: Currency): string {
  const formatted = Math.round(price).toLocaleString('ru-RU');
  const symbol = currencySymbols[currency];
  return currency === 'USD' ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

function formatDayLabel(isoDate: string, today: Date): string {
  const day = startOfLocalDay(new Date(`${isoDate}T12:00:00`));
  if (Number.isNaN(day.getTime())) return isoDate;
  const todayStart = startOfLocalDay(today);
  const diff = Math.round((day.getTime() - todayStart.getTime()) / 86_400_000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  return day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${word}`;
}

export function isNewPurchaseQuote(quote: SupplierQuote, now = new Date()): boolean {
  if (quote.isTest) return true;
  const created = new Date(quote.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const cutoff = addDays(now, -NEW_QUOTE_DAYS);
  return created >= cutoff;
}

export function upcomingDeliveriesWithinDays(
  deliveries: PurchaseDelivery[],
  withinDays: number,
  now = new Date(),
): PurchaseDelivery[] {
  const from = startOfLocalDay(now);
  const to = addDays(from, withinDays);
  return deliveries
    .filter((d) => {
      if (d.status === 'cancelled' || d.status === 'accepted') return false;
      if (!d.plannedDate) return false;
      const day = startOfLocalDay(new Date(`${d.plannedDate}T12:00:00`));
      if (Number.isNaN(day.getTime())) return false;
      return day >= from && day <= to;
    })
    .sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? ''));
}

function NoticeCard({
  icon,
  title,
  subtitle,
  empty,
  testMarked,
  onOpen,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  empty?: boolean;
  testMarked?: boolean;
  onOpen?: () => void;
  children?: React.ReactNode;
}) {
  const clickable = Boolean(onOpen) && !empty;
  const body = (
    <>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl',
            empty ? 'bg-surface-muted text-ink-faint' : 'bg-info-bg text-info-text',
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-sm font-semibold', empty ? 'text-ink-muted' : 'text-ink')}>{title}</span>
            {testMarked && !empty && <Badge tone="warning">Тест</Badge>}
            {clickable && <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-ink-faint" />}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
          {children && <div className="mt-3 flex flex-col gap-2">{children}</div>}
        </div>
      </div>
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'w-full rounded-3xl border border-white/80 bg-white/60 p-5 text-left backdrop-blur-xl transition-colors',
          'hover:border-white hover:bg-white/80 sm:border-white/60 sm:bg-white/40',
        )}
        style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)' }}
      >
        {body}
      </button>
    );
  }

  return (
    <Card className={cn('p-5', empty && 'opacity-80')}>{body}</Card>
  );
}

export function PurchasesOverview({
  quotes,
  offers,
  unmatched,
  deliveries,
  orders,
  onOpenComparison,
  onOpenUnmatched,
  onOpenOrders,
}: {
  quotes: SupplierQuote[];
  offers: SupplierOffer[];
  unmatched: UnmatchedIncomingEmail[];
  deliveries: PurchaseDelivery[];
  orders: PurchaseOrder[];
  onOpenComparison: () => void;
  onOpenUnmatched: () => void;
  onOpenOrders: () => void;
}) {
  const now = new Date();
  const offerNameById = new Map(offers.map((o) => [o.id, o.name]));
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const newQuotes = quotes
    .filter((q) => isNewPurchaseQuote(q, now))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  const newQuotesHaveTest = newQuotes.some((q) => q.isTest);

  const unmatchedOpen = unmatched.filter((e) => !e.resolvedAt);
  const unmatchedHaveTest = unmatchedOpen.some((e) => e.isTest);

  const upcoming = upcomingDeliveriesWithinDays(deliveries, 2, now);
  const upcomingHaveTest = upcoming.some((d) => d.isTest);

  return (
    <div className="mt-6 flex max-w-2xl flex-col gap-3">
      <p className="text-sm text-ink-muted">Коротко по тому, что требует внимания прямо сейчас.</p>

      <NoticeCard
        icon={<FileSpreadsheet className="h-4 w-4" />}
        title={
          newQuotes.length === 0
            ? 'Новых КП нет'
            : pluralRu(newQuotes.length, 'новое КП', 'новых КП', 'новых КП')
        }
        subtitle={
          newQuotes.length === 0
            ? 'Свежие счета появятся здесь после распознавания писем'
            : `За последние ${NEW_QUOTE_DAYS} дней`
        }
        empty={newQuotes.length === 0}
        testMarked={newQuotesHaveTest}
        onOpen={newQuotes.length > 0 ? onOpenComparison : undefined}
      >
        {newQuotes.map((q) => (
          <div key={q.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">
              {offerNameById.get(q.offerId) ?? 'Поставщик'}
              <span className="text-ink-muted"> · {q.title || 'Без темы'}</span>
            </span>
            <span className="shrink-0 tabular-nums font-medium text-ink">
              {formatMoney(q.price, q.currency)}
            </span>
          </div>
        ))}
      </NoticeCard>

      <NoticeCard
        icon={<Mail className="h-4 w-4" />}
        title={
          unmatchedOpen.length === 0
            ? 'Неразобранных писем нет'
            : pluralRu(unmatchedOpen.length, 'письмо разобрать', 'письма разобрать', 'писем разобрать')
        }
        subtitle={
          unmatchedOpen.length === 0
            ? 'Входящие без привязки к карточке поставщика'
            : 'Не привязались к карточке автоматически'
        }
        empty={unmatchedOpen.length === 0}
        testMarked={unmatchedHaveTest}
        onOpen={unmatchedOpen.length > 0 ? onOpenUnmatched : undefined}
      >
        {unmatchedOpen.slice(0, 4).map((e) => (
          <div key={e.id} className="flex flex-col gap-0.5 text-sm">
            <span className="truncate font-medium text-ink">{e.subject || 'Без темы'}</span>
            <span className="truncate text-xs text-ink-muted">{e.fromAddress}</span>
          </div>
        ))}
      </NoticeCard>

      <NoticeCard
        icon={<Package className="h-4 w-4" />}
        title={
          upcoming.length === 0
            ? 'Поставок на ближайшие 2 дня нет'
            : pluralRu(upcoming.length, 'поставка', 'поставки', 'поставок') + ' на ближайшие 2 дня'
        }
        subtitle={upcoming.length === 0 ? 'Запланированные привозы на сегодня–послезавтра' : undefined}
        empty={upcoming.length === 0}
        testMarked={upcomingHaveTest}
        onOpen={upcoming.length > 0 ? onOpenOrders : undefined}
      >
        {upcoming.map((d) => {
          const order = orderById.get(d.orderId);
          return (
            <div key={d.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink">
                <span className="font-medium">{formatDayLabel(d.plannedDate!, now)}</span>
                <span className="text-ink-muted">
                  {' '}
                  · {order?.supplierName || 'Поставщик'}
                  {d.receiverName ? ` · ${d.receiverName}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-xs text-ink-muted">
                {PURCHASE_DELIVERY_STATUS_LABELS[d.status]}
              </span>
            </div>
          );
        })}
      </NoticeCard>
    </div>
  );
}
