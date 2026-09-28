import { useEffect, useState } from 'react';
import { Factory } from 'lucide-react';
import { SUPPLIER_KIND_LABELS, type Supplier } from '../../data/suppliers';
import { fetchSupplier } from '../../lib/suppliersApi';

// Кто компания на самом деле: завод, владелец марки, дилер или магазин, и
// что она делает сама (тред «Закупки», 2026-09-28: «в карточке не вижу,
// он завод или нет и для каких позиций»). Профиль заполняет разбор сайта,
// поэтому грузим одну строку компании по открытию карточки, а не весь
// список поставщиков заранее. Не размечен — блока нет.

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((x) => (
        <span key={x} className="rounded-full border border-border px-2 py-0.5 text-xs text-ink">
          {x}
        </span>
      ))}
    </div>
  );
}

export function SupplierProfileBlock({ supplierId }: { supplierId: string | null }) {
  const [supplier, setSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    setSupplier(null);
    if (!supplierId) return;
    let cancelled = false;
    fetchSupplier(supplierId)
      .then((s) => {
        if (!cancelled) setSupplier(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supplierId]);

  if (!supplier?.supplierKind) return null;
  const direct = supplier.supplierKind === 'manufacturer' || supplier.supplierKind === 'brand_owner';

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border p-3 text-sm">
      <div className="flex items-center gap-2">
        <Factory className={direct ? 'h-4 w-4 text-success' : 'h-4 w-4 text-ink-faint'} />
        <span className="font-medium text-ink">{SUPPLIER_KIND_LABELS[supplier.supplierKind]}</span>
      </div>
      {supplier.productKinds.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-ink-faint">{direct ? 'Производит сам' : 'Продаёт'}</span>
          <Chips items={supplier.productKinds} />
        </div>
      )}
      {supplier.ownBrands.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-ink-faint">Свои марки и линейки</span>
          <Chips items={supplier.ownBrands} />
        </div>
      )}
      {supplier.articlePrefixes.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-ink-faint">Артикулы начинаются с</span>
          <Chips items={supplier.articlePrefixes} />
        </div>
      )}
      {supplier.resoldBrands.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-ink-faint">Чужие марки (перепродаёт)</span>
          <Chips items={supplier.resoldBrands} />
        </div>
      )}
      {supplier.profileNote && <span className="text-xs text-ink-faint">{supplier.profileNote}</span>}
    </div>
  );
}
