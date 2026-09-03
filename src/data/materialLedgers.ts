import type { PurchaseItem } from './purchases';

// Владелец, 2026-09-03: "хочу реализовать функционал прикрепления ведомостей
// материалов к письму... предусмотреть пресеты, чтобы Альмира могла один раз
// создать ведомость под окна и рассылать её всем, или универсальную
// ведомость". Ведомость — просто именованный список позиций (тот же
// PurchaseItem, что и у SupplierRequest.items/Purchase.items — снимок
// название/ед./кол-во), не привязанный ни к категории, ни к поставщику —
// выбирается в композере письма (см. components/suppliers/
// MaterialLedgerModal.tsx) независимо от того, кому пишем.
export interface MaterialLedger {
  id: string;
  name: string;
  items: PurchaseItem[];
  createdAt: string;
}

export interface MaterialLedgerRow {
  id: string;
  name: string;
  items: PurchaseItem[] | null;
  created_at: string;
}
