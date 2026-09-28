import type { SupplierOffer, SupplierRequest } from '../../data/supplierResearch';
import type { SupplierOrder } from '../../data/supplierOrders';
import type { SupplierOfferEmail } from '../../data/supplierOfferEmails';

// Владелец, 2026-09-28: «поставщики разбиты на группы, но у нас много групп у
// одного поставщика — давай делать просто историю переписок, список всех
// переписок по хронологии». Модель вкладки «Письма»: одна строка списка —
// один поставщик (компания, supplier_id), все его предложения по разным
// категориям и доп. заявки сведены в одну ленту. Внутри ленты письмо
// по-прежнему принадлежит своей «теме» — паре предложение × заявка, туда же
// уходит ответ (адрес для переписки у темы свой, см. supplierOfferEmailAddress).

export interface CorrespondenceTopic {
  // `${offerId}:${orderId ?? 'main'}` — живёт в URL (?topic=).
  key: string;
  offer: SupplierOffer;
  request: SupplierRequest | null;
  order: SupplierOrder | null;
  title: string;
  emails: SupplierOfferEmail[];
  unreadCount: number;
  lastAt: string;
}

export interface Conversation {
  // s:<supplier_id> или o:<offer_id> для предложения без карточки компании.
  key: string;
  name: string;
  supplierId: string | null;
  offers: SupplierOffer[];
  topics: CorrespondenceTopic[];
  // Все письма поставщика по всем темам, от старых к новым.
  emails: SupplierOfferEmail[];
  lastEmail: SupplierOfferEmail | null;
  unreadCount: number;
  // Последнее письмо — наше и оно ушло (или стоит в очереди): ждём поставщика.
  waitingReply: boolean;
  requestIds: string[];
  categoryTitles: string[];
  verified: boolean;
}

export function topicKey(offerId: string, orderId: string | null): string {
  return `${offerId}:${orderId ?? 'main'}`;
}

export function conversationKeyOf(offer: SupplierOffer): string {
  return offer.supplierId ? `s:${offer.supplierId}` : `o:${offer.id}`;
}

export function buildConversations(
  requests: SupplierRequest[],
  offers: SupplierOffer[],
  orders: SupplierOrder[],
  emails: SupplierOfferEmail[],
  unreadCountOf: (threadEmails: SupplierOfferEmail[]) => number,
): Conversation[] {
  const requestById = new Map(requests.map((r) => [r.id, r]));
  const emailsByOffer = new Map<string, SupplierOfferEmail[]>();
  for (const e of emails) {
    const list = emailsByOffer.get(e.offerId);
    if (list) list.push(e);
    else emailsByOffer.set(e.offerId, [e]);
  }
  const ordersByOffer = new Map<string, SupplierOrder[]>();
  for (const o of orders) {
    const list = ordersByOffer.get(o.offerId);
    if (list) list.push(o);
    else ordersByOffer.set(o.offerId, [o]);
  }

  const byKey = new Map<string, Conversation>();
  for (const offer of offers) {
    const offerEmails = (emailsByOffer.get(offer.id) ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    // Писать можно только верифицированному поставщику с email; уже идущую
    // переписку показываем всегда — на старое письмо надо уметь ответить,
    // не дожидаясь верификации (владелец, 2026-09-14).
    if (offerEmails.length === 0 && (!offer.email || !offer.verified)) continue;
    const request = requestById.get(offer.requestId) ?? null;
    const categoryTitle = request?.title ?? 'Без категории';
    const threads: (SupplierOrder | null)[] = [null, ...(ordersByOffer.get(offer.id) ?? [])];
    const topics = threads.map((order): CorrespondenceTopic => {
      const threadEmails = offerEmails.filter((e) => (e.orderId ?? null) === (order?.id ?? null));
      return {
        key: topicKey(offer.id, order?.id ?? null),
        offer,
        request,
        order,
        title: order ? `${categoryTitle} · ${order.title || 'Без названия'}` : categoryTitle,
        emails: threadEmails,
        unreadCount: threadEmails.length > 0 ? unreadCountOf(threadEmails) : 0,
        lastAt: threadEmails[threadEmails.length - 1]?.createdAt ?? '',
      };
    });

    const key = conversationKeyOf(offer);
    let conv = byKey.get(key);
    if (!conv) {
      conv = {
        key,
        name: offer.name,
        supplierId: offer.supplierId ?? null,
        offers: [],
        topics: [],
        emails: [],
        lastEmail: null,
        unreadCount: 0,
        waitingReply: false,
        requestIds: [],
        categoryTitles: [],
        verified: false,
      };
      byKey.set(key, conv);
    }
    conv.offers.push(offer);
    conv.topics.push(...topics);
    conv.emails.push(...offerEmails);
    if (offer.verified) conv.verified = true;
    if (!conv.requestIds.includes(offer.requestId)) conv.requestIds.push(offer.requestId);
    if (!conv.categoryTitles.includes(categoryTitle)) conv.categoryTitles.push(categoryTitle);
  }

  for (const conv of byKey.values()) {
    conv.emails.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    conv.lastEmail = conv.emails[conv.emails.length - 1] ?? null;
    conv.unreadCount = conv.topics.reduce((sum, t) => sum + t.unreadCount, 0);
    conv.waitingReply = conv.lastEmail?.direction === 'out' && conv.lastEmail.sendStatus !== 'failed';
    // Темы с письмами — по свежести, пустые — в конце, в исходном порядке.
    conv.topics.sort((a, b) => (a.lastAt === b.lastAt ? 0 : !a.lastAt ? 1 : !b.lastAt ? -1 : b.lastAt.localeCompare(a.lastAt)));
    // Название — из самого свежего по переписке предложения: у компании
    // может быть несколько карточек-предложений с разным написанием.
    const freshestOffer = conv.lastEmail ? conv.offers.find((o) => o.id === conv.lastEmail!.offerId) : null;
    if (freshestOffer) conv.name = freshestOffer.name;
  }

  return [...byKey.values()].sort((a, b) => {
    const la = a.lastEmail?.createdAt ?? '';
    const lb = b.lastEmail?.createdAt ?? '';
    if (la !== lb) return lb.localeCompare(la);
    return a.name.localeCompare(b.name, 'ru');
  });
}

// Тема, в которую по умолчанию уходит ответ: где последнее входящее, иначе
// где последнее письмо вообще, иначе первая.
export function defaultReplyTopic(conv: Conversation): CorrespondenceTopic | null {
  const lastIn = [...conv.emails].reverse().find((e) => e.direction === 'in');
  const anchor = lastIn ?? conv.lastEmail;
  if (anchor) {
    const found = conv.topics.find((t) => t.key === topicKey(anchor.offerId, anchor.orderId ?? null));
    if (found) return found;
  }
  return conv.topics[0] ?? null;
}

export function conversationMatches(conv: Conversation, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (conv.name.toLowerCase().includes(q)) return true;
  if (conv.offers.some((o) => (o.email ?? '').toLowerCase().includes(q))) return true;
  return conv.emails.some((e) => e.subject.toLowerCase().includes(q) || e.body.toLowerCase().includes(q));
}

// Подпись дня над группой строк: «Сегодня», «Вчера», «25 сентября»
// (год — только если не текущий).
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  return d.toLocaleDateString('ru-RU', d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
}

export function shortTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  return dayLabel(iso, now) === 'Сегодня' || dayLabel(iso, now) === 'Вчера'
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
