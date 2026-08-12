import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { Modal } from '../components/ui/Modal';
import {
  transactions as initialTransactions,
  currencies,
  currencySymbols,
  categories,
  type Transaction,
  type Currency,
  type Category,
} from '../data/transactions';

function formatDate(iso: string) {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

function formatAmount(amount: number, currency: Currency) {
  return `${amount.toLocaleString('ru-RU')} ${currencySymbols[currency]}`;
}

const emptyForm = {
  date: '',
  amount: '',
  currency: 'RUB' as Currency,
  purpose: '',
  category: 'Маркетинг' as Category,
  paidBy: '',
  paidFrom: '',
  compensated: 'Нет',
};

export function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const canSubmit = form.date && form.amount && form.purpose && form.paidBy && form.paidFrom;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setTransactions((prev) => [
      {
        id: `t${Date.now()}`,
        date: form.date,
        amount: Number(form.amount),
        currency: form.currency,
        purpose: form.purpose,
        category: form.category,
        paidBy: form.paidBy,
        paidFrom: form.paidFrom,
        compensated: form.compensated === 'Да',
      },
      ...prev,
    ]);
    setForm(emptyForm);
    setOpen(false);
  }

  return (
    <>
      <PageHeader
        title="Транзакции"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Добавить транзакцию
          </Button>
        }
      />

      <Card className="flex flex-col gap-4 p-0">
        <div className="overflow-x-auto">
          <div className="grid min-w-[1000px] grid-cols-[100px_120px_1.6fr_1fr_1fr_1fr_110px] gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
            <span>Дата</span>
            <span>Сумма</span>
            <span>Назначение</span>
            <span>Категория</span>
            <span>Кто платил</span>
            <span>Откуда платил</span>
            <span>Компенсация</span>
          </div>
          {transactions.map((t) => (
            <div
              key={t.id}
              className="grid min-w-[1000px] grid-cols-[100px_120px_1.6fr_1fr_1fr_1fr_110px] items-center gap-4 border-t border-border px-6 py-4 text-sm"
            >
              <span className="text-ink-muted">{formatDate(t.date)}</span>
              <span className="font-semibold text-ink">{formatAmount(t.amount, t.currency)}</span>
              <span className="text-ink">{t.purpose}</span>
              <span>
                <Badge tone="neutral">{t.category}</Badge>
              </span>
              <span className="text-ink-muted">{t.paidBy}</span>
              <span className="text-ink-muted">{t.paidFrom}</span>
              <span>
                <Badge tone={t.compensated ? 'success' : 'warning'}>{t.compensated ? 'Да' : 'Нет'}</Badge>
              </span>
            </div>
          ))}
          {transactions.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-ink-muted">Транзакций пока нет</div>
          )}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Новая транзакция">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Дата"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <Input
                label="Сумма"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
              <Select
                label="Валюта"
                options={[...currencies]}
                value={form.currency}
                onChange={(v) => setForm((f) => ({ ...f, currency: v as Currency }))}
              />
            </div>
          </div>

          <Input
            label="Назначение"
            placeholder="На что потрачено"
            value={form.purpose}
            onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
            required
          />

          <Select
            label="Категория"
            options={[...categories]}
            value={form.category}
            onChange={(v) => setForm((f) => ({ ...f, category: v as Category }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Кто платил"
              placeholder="Имя сотрудника"
              value={form.paidBy}
              onChange={(e) => setForm((f) => ({ ...f, paidBy: e.target.value }))}
              required
            />
            <Input
              label="Откуда платил"
              placeholder="Карта, счёт, наличные..."
              value={form.paidFrom}
              onChange={(e) => setForm((f) => ({ ...f, paidFrom: e.target.value }))}
              required
            />
          </div>

          <ToggleGroup
            label="Статус компенсации"
            options={['Да', 'Нет']}
            value={form.compensated}
            onChange={(v) => setForm((f) => ({ ...f, compensated: v }))}
          />

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Добавить
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
