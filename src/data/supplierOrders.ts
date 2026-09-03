import type { Currency } from './transactions';
import type { DocumentFile } from './contractorDocuments';
import type { PurchaseItem } from './purchases';

// Владелец, 2026-09-03: "у нас может быть несколько переписок с одним
// поставщиком, особенно с универсальными. По сути — 1 заявка на поставку —
// одна ветка". Дополнительная заявка тому же поставщику (SupplierOffer) —
// свой собственный тред переписки со своим адресом (shortCode), ценой,
// позициями, файлами и статусом, не смешанный с "основной" перепиской
// офера. У каждого поставщика всегда есть его "основная" переписка (та,
// что была всегда — на офере самом по себе), supplier_orders — только
// дополнительные, поверх неё. Список заявок конкретного поставщика —
// components/suppliers/SupplierCorrespondenceTab.tsx.
export interface SupplierOrder {
  id: string;
  offerId: string;
  title: string;
  communicationStatus: string;
  price: number;
  currency: Currency;
  deadline: string;
  requirements: string;
  items: PurchaseItem[];
  files: DocumentFile[];
  shortCode: string;
  createdAt: string;
}

export interface SupplierOrderRow {
  id: string;
  offer_id: string;
  title: string;
  communication_status: string;
  price: number;
  currency: string;
  deadline: string;
  requirements: string;
  items: PurchaseItem[] | null;
  files: DocumentFile[] | null;
  short_code: string;
  created_at: string;
}
