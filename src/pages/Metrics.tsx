import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { fetchActivityLog } from '../lib/activityLogApi';
import type { ActivityLogEntry } from '../data/activityLog';
import { fetchAllSupplierOfferEmails } from '../lib/supplierOfferEmailsApi';
import type { SupplierOfferEmail } from '../data/supplierOfferEmails';

// Владелец, 2026-09-05: "давай трекать Альмиру" (по аналогии с Activity Log
// Светланы — см. data/activityLog.ts/ActivityLog.tsx). Страница НЕ в меню и
// не в data/pages.ts (владелец: "не выводи в меню, дай просто ссылку") —
// доступ только по прямому урлу /admin/metrics, гейт RequireSuperAdmin (см.
// App.tsx), тот же принцип, что и у /admin/activity-log.
//
// Верификация/ручное добавление поставщика — события, у которых нет своего
// поля в базе (verified:true ставится в обоих случаях, см. комментарий в
// Suppliers.tsx у submitOffer), поэтому считаем их через activity_log, как и
// у Светланы. Письма, наоборот, НЕ логируем отдельно — вся переписка уже
// хранится в supplier_offer_emails с адресом получателя, этого достаточно,
// чтобы посчитать и общее число, и число уникальных получателей напрямую.
interface StatTileProps {
  label: string;
  value: number;
  hint?: string;
}

function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className={cn('flex flex-col gap-1 p-4', glassCardClass)} style={glassCardShadow}>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-3xl font-semibold text-ink">{value.toLocaleString('ru-RU')}</p>
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export function Metrics() {
  const [entries, setEntries] = useState<ActivityLogEntry[] | null>(null);
  const [emails, setEmails] = useState<SupplierOfferEmail[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchActivityLog(), fetchAllSupplierOfferEmails()])
      .then(([logEntries, offerEmails]) => {
        setEntries(logEntries);
        setEmails(offerEmails);
      })
      .catch(() => setError('Не удалось загрузить метрики.'));
  }, []);

  const verifiedCount = useMemo(
    () => (entries ?? []).filter((e) => e.action === 'supplier_offer_verified').length,
    [entries],
  );
  const addedManuallyCount = useMemo(
    () => (entries ?? []).filter((e) => e.action === 'supplier_offer_added_manually').length,
    [entries],
  );

  const outgoingEmails = useMemo(() => (emails ?? []).filter((e) => e.direction === 'out'), [emails]);
  const totalEmailsCount = outgoingEmails.length;
  const uniqueEmailsCount = useMemo(
    () => new Set(outgoingEmails.map((e) => e.toAddress.trim().toLowerCase())).size,
    [outgoingEmails],
  );

  const loading = entries === null || emails === null;

  return (
    <>
      <PageHeader title="Метрики" />

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading && !error && (
        <div className="flex items-center gap-2 text-sm text-ink-faint">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {!loading && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-faint">
            Активность по работе с поставщиками (раздел «Поставщики» → «Ресерч»/«Письма»), за всё время.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Верифицировано поставщиков"
              value={verifiedCount}
              hint="Подтверждены данные у поставщика, добавленного веб-поиском"
            />
            <StatTile
              label="Добавлено вручную"
              value={addedManuallyCount}
              hint="Новое предложение, заполненное через форму с нуля"
            />
            <StatTile
              label="Уникальных писем отправлено"
              value={uniqueEmailsCount}
              hint="Разных адресов получателей"
            />
            <StatTile label="Писем отправлено всего" value={totalEmailsCount} hint="Включая повторные письма" />
          </div>
        </div>
      )}
    </>
  );
}
