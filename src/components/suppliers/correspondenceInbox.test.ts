import { describe, expect, it } from 'vitest';
import { buildConversations, dayLabel, defaultReplyTopic, topicKey } from './correspondenceInbox';
import type { SupplierOffer, SupplierRequest } from '../../data/supplierResearch';
import type { SupplierOfferEmail } from '../../data/supplierOfferEmails';

const req = (id: string, title: string) => ({ id, title }) as SupplierRequest;
const offer = (id: string, requestId: string, supplierId: string | null, extra: Partial<SupplierOffer> = {}) =>
  ({ id, requestId, supplierId, name: `Поставщик ${id}`, email: 'a@b.by', verified: true, ...extra }) as SupplierOffer;
const email = (id: string, offerId: string, createdAt: string, direction: 'in' | 'out', orderId: string | null = null) =>
  ({ id, offerId, orderId, createdAt, direction, subject: '', body: '', files: [], sendStatus: 'sent' }) as unknown as SupplierOfferEmail;

describe('buildConversations', () => {
  const requests = [req('r1', 'Плитка'), req('r2', 'Сантехника')];

  it('сводит предложения одной компании в одну переписку и сортирует по свежести', () => {
    const offers = [offer('o1', 'r1', 's1'), offer('o2', 'r2', 's1'), offer('o3', 'r1', 's2')];
    const emails = [
      email('e1', 'o1', '2026-09-20T10:00:00Z', 'out'),
      email('e2', 'o2', '2026-09-22T10:00:00Z', 'in'),
      email('e3', 'o3', '2026-09-21T10:00:00Z', 'out'),
    ];
    const convs = buildConversations(requests, offers, [], emails, (t) => t.filter((e) => e.direction === 'in').length);
    expect(convs.map((c) => c.key)).toEqual(['s:s1', 's:s2']);
    expect(convs[0].categoryTitles).toEqual(['Плитка', 'Сантехника']);
    expect(convs[0].emails.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(convs[0].unreadCount).toBe(1);
    expect(convs[0].waitingReply).toBe(false);
    expect(convs[1].waitingReply).toBe(true);
    expect(defaultReplyTopic(convs[0])?.key).toBe(topicKey('o2', null));
  });

  it('не показывает неверифицированных без писем, но показывает с письмами', () => {
    const offers = [offer('o1', 'r1', null, { verified: false }), offer('o2', 'r1', null, { verified: false })];
    const convs = buildConversations(requests, offers, [], [email('e1', 'o2', '2026-09-20T10:00:00Z', 'in')], () => 0);
    expect(convs.map((c) => c.key)).toEqual(['o:o2']);
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 8, 28, 12);
  it('сегодня/вчера/дата', () => {
    expect(dayLabel(new Date(2026, 8, 28, 9).toISOString(), now)).toBe('Сегодня');
    expect(dayLabel(new Date(2026, 8, 27, 23).toISOString(), now)).toBe('Вчера');
    expect(dayLabel(new Date(2026, 8, 25, 9).toISOString(), now)).toBe('25 сентября');
  });
});
