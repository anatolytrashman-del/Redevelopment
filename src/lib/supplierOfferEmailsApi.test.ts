import { describe, it, expect } from 'vitest';
import type { SupplierOfferEmail, EmailExtraction } from '../data/supplierOfferEmails';
import { mergeInboxEmails, applyEmailBodies } from './supplierOfferEmailsApi';

function makeEmail(over: Partial<SupplierOfferEmail> & { id: string }): SupplierOfferEmail {
  return {
    id: over.id,
    offerId: over.offerId ?? 'o1',
    orderId: over.orderId ?? null,
    direction: over.direction ?? 'in',
    fromAddress: over.fromAddress ?? 'a@b',
    toAddress: over.toAddress ?? 'c@d',
    subject: over.subject ?? 'subj',
    body: over.body ?? '',
    files: over.files ?? [],
    resendMessageId: over.resendMessageId ?? null,
    readAt: over.readAt ?? null,
    extraction: over.extraction ?? null,
    sentByProfileId: over.sentByProfileId ?? null,
    sentByName: over.sentByName ?? null,
    sendStatus: (over.sendStatus ?? null) as any,
    sendError: over.sendError ?? null,
    deliveredAt: over.deliveredAt ?? null,
    openedAt: over.openedAt ?? null,
    bouncedAt: over.bouncedAt ?? null,
    bounceReason: over.bounceReason ?? null,
    complainedAt: over.complainedAt ?? null,
    messageIdHeader: over.messageIdHeader ?? null,
    createdAt: over.createdAt ?? '2026-10-01T00:00:00Z',
  };
}

describe('mergeInboxEmails', () => {
  it('пустой body во fresh не затирает сохранённый в prev', () => {
    const prev = [makeEmail({ id: 'e1', body: 'полный текст из предыдущей загрузки', subject: 's1' })];
    const fresh = [makeEmail({ id: 'e1', body: '', subject: 's1' })];
    const res = mergeInboxEmails(prev, fresh);
    expect(res).toHaveLength(1);
    expect(res[0].body).toBe('полный текст из предыдущей загрузки');
    expect(res[0].extraction).toBe(null);
  });

  it('письмо, которого нет в fresh, пропадает', () => {
    const prev = [makeEmail({ id: 'old', body: 'oldbody' }), makeEmail({ id: 'keep', body: 'k' })];
    const fresh = [makeEmail({ id: 'keep', body: 'k' })];
    const res = mergeInboxEmails(prev, fresh);
    expect(res.map((e) => e.id)).toEqual(['keep']);
  });

  it('extraction берётся из fresh, если есть', () => {
    const ext: EmailExtraction = { status: 'pending', isInvoice: false, attempts: 0, skipped: [] } as any;
    const prev = [makeEmail({ id: 'e1', body: 'b', extraction: null })];
    const fresh = [makeEmail({ id: 'e1', body: 'b2', extraction: ext })];
    const res = mergeInboxEmails(prev, fresh);
    expect(res[0].extraction).toBe(ext);
    expect(res[0].body).toBe('b2');
  });
});

describe('applyEmailBodies', () => {
  it('вливает body по id и не трогает subject', () => {
    const prev = [makeEmail({ id: 'e1', body: '', subject: 'old subj' }), makeEmail({ id: 'e2', body: 'old2', subject: 's2' })];
    const bodies = [
      { id: 'e1', body: 'новый текст', extraction: null },
    ];
    const res = applyEmailBodies(prev, bodies);
    expect(res).toHaveLength(2);
    expect(res[0].body).toBe('новый текст');
    expect(res[0].subject).toBe('old subj');
    expect(res[1].body).toBe('old2');
  });

  it('если body в bodies пустой — ставит пустой (не падает)', () => {
    const prev = [makeEmail({ id: 'e1', body: 'was' })];
    const bodies = [{ id: 'e1', body: '', extraction: null }];
    const res = applyEmailBodies(prev, bodies);
    expect(res[0].body).toBe('');
  });
});
