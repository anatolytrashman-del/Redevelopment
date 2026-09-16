import { describe, expect, it } from 'vitest';
import { offerFollowupState, followupCounts } from './supplierResearch';
import type { SupplierOffer } from './supplierResearch';
import type { SupplierOfferEmail } from './supplierOfferEmails';

const NOW = new Date('2026-09-16T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

function offer(patch: Partial<SupplierOffer> = {}): SupplierOffer {
  return {
    id: 'o1',
    requestId: 'r1',
    name: 'ООО Поставщик',
    contact: '+7',
    contactMethod: 'Телефон',
    email: 'a@b.ru',
    managerName: '',
    country: 'Россия',
    websiteUrl: '',
    listingUrl: '',
    contactSource: '',
    messengers: [],
    catalogModelName: '',
    catalogModelPhoto: null,
    price: 0,
    currency: 'RUB',
    items: [],
    files: [],
    shortCode: 'abcde',
    verified: true,
    inn: null,
    queueSnoozedAt: null,
    outcome: null,
    outcomeAt: null,
    reminderStage: 0,
    reminderSentAt: null,
    createdAt: daysAgo(30),
    ...patch,
  } as SupplierOffer;
}

function email(direction: 'in' | 'out', days: number, offerId = 'o1'): SupplierOfferEmail {
  return {
    id: `${direction}-${days}`,
    offerId,
    orderId: null,
    direction,
    fromAddress: '',
    toAddress: '',
    subject: 'Запрос цены',
    body: '',
    files: [],
    createdAt: daysAgo(days),
  } as unknown as SupplierOfferEmail;
}

describe('дожим, шаг 8', () => {
  it('срок ещё не вышел — ждём', () => {
    const st = offerFollowupState(offer(), [email('out', 1)], 3, NOW);
    expect(st.stage).toBe('waiting');
    expect(st.daysSilent).toBe(1);
  });

  it('срок вышел — пора напомнить', () => {
    expect(offerFollowupState(offer(), [email('out', 3)], 3, NOW).stage).toBe('due');
    expect(offerFollowupState(offer(), [email('out', 9)], 3, NOW).stage).toBe('due');
  });

  it('ответил — дожим не наше дело, дальше человек', () => {
    // Приёмка: поставщику, который и так пишет, напоминать нельзя.
    const st = offerFollowupState(offer(), [email('out', 10), email('in', 8)], 3, NOW);
    expect(st.stage).toBe('answered');
  });

  it('счёт считается ответом, даже если письма не было', () => {
    const st = offerFollowupState(offer({ price: 1000 }), [email('out', 30)], 3, NOW);
    expect(st.stage).toBe('quoted');
  });

  it('отказ важнее КП: не ждём от него ничего', () => {
    const st = offerFollowupState(offer({ price: 1000, outcome: 'declined' }), [email('out', 30)], 3, NOW);
    expect(st.stage).toBe('declined');
  });

  it('молчание считается с ПОСЛЕДНЕГО нашего письма, включая напоминание', () => {
    const st = offerFollowupState(offer({ reminderStage: 1 }), [email('out', 10), email('out', 2)], 3, NOW);
    expect(st.stage).toBe('waiting');
    expect(st.daysSilent).toBe(2);
    expect(st.reminders).toBe(1);
  });

  it('не писали вовсе — дожимать нечего', () => {
    expect(offerFollowupState(offer(), [], 3, NOW).stage).toBe('none');
  });

  it('воронка считает дожим, отказы и молчание', () => {
    const offers = [
      offer({ id: 'a' }),
      offer({ id: 'b', reminderStage: 2 }),
      offer({ id: 'c', outcome: 'declined' }),
      offer({ id: 'd', outcome: 'no_answer', reminderStage: 2 }),
      offer({ id: 'e', price: 5000 }),
    ];
    const emails = offers.map((o) => email('out', 5, o.id));
    const counts = followupCounts(offers, emails, 3, NOW);
    expect(counts).toEqual({ followingUp: 2, declined: 1, noAnswer: 1, reminders: 4 });
  });
});
