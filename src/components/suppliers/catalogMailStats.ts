import { pendingIncomingEmails } from '../../lib/pendingEmails';
import type { SupplierOfferEmail } from '../../data/supplierOfferEmails';
import type { SupplierOffer } from '../../data/supplierResearch';
import { conversationKeyOf } from './correspondenceInbox';

// Счётчики переписки для строк каталога: непрочитанные треды и «ждём ответа».
// Та же логика, что у вкладки «Письма» (pendingEmails + последнее исходящее).

export interface CatalogMailStats {
  unread: number;
  waiting: boolean;
}

export function buildCatalogMailStats(
  offers: SupplierOffer[],
  emails: SupplierOfferEmail[],
): Map<string, CatalogMailStats> {
  const emailsByOffer = new Map<string, SupplierOfferEmail[]>();
  for (const e of emails) {
    const list = emailsByOffer.get(e.offerId);
    if (list) list.push(e);
    else emailsByOffer.set(e.offerId, [e]);
  }

  const byCompany = new Map<string, SupplierOfferEmail[]>();
  for (const offer of offers) {
    const key = conversationKeyOf(offer);
    const mine = emailsByOffer.get(offer.id) ?? [];
    const prev = byCompany.get(key);
    if (prev) prev.push(...mine);
    else byCompany.set(key, [...mine]);
  }

  const result = new Map<string, CatalogMailStats>();
  for (const [key, list] of byCompany) {
    const sorted = list.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const unread = pendingIncomingEmails(sorted, (e) => `${e.offerId}|${e.orderId ?? ''}`).length;
    const last = sorted[sorted.length - 1] ?? null;
    const waiting = Boolean(last && last.direction === 'out' && last.sendStatus !== 'failed');
    result.set(key, { unread, waiting });
  }
  return result;
}

export function mailStatsForOffer(
  offer: SupplierOffer,
  stats: Map<string, CatalogMailStats>,
): CatalogMailStats {
  return stats.get(conversationKeyOf(offer)) ?? { unread: 0, waiting: false };
}
