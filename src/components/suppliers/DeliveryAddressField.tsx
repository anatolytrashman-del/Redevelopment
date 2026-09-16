import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import type { PurchaseDeliveryAddress } from '../../data/purchaseDeliveryAddresses';
import { insertPurchaseDeliveryAddress } from '../../lib/purchaseDeliveryAddressesApi';

// Адрес доставки заказа: выбрать из шаблонов, подставить адрес объекта из
// карточки юрлица или вписать свой и тут же сохранить шаблоном (владелец,
// 2026-09-16: «Вытащи адрес доставки из шаблона при отправке поставщику, там
// он указан и сохрани как шаблон»).
//
// Зачем вообще: до этого адрес был голым текстовым полем, и в живом заказе в
// нём стояло «Зеленый» — кусок названия посёлка, набранный по памяти, хотя
// полный адрес объекта уже лежит в `legal_entities.delivery_info` и уходит
// поставщику вложением.

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

export function DeliveryAddressField({
  value,
  onChange,
  addresses,
  onAddressesChange,
  legalEntityId,
  entityAddress,
}: {
  value: string;
  onChange: (next: string) => void;
  addresses: PurchaseDeliveryAddress[];
  onAddressesChange: (next: PurchaseDeliveryAddress[]) => void;
  legalEntityId: string | null;
  // Адрес объекта из «Информации по доставке» юрлица. Пусто — в тексте не
  // нашлось строки «Адрес…:» или юрлицо у заказа не указано.
  entityAddress: string;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const known = addresses.map((a) => a.address);
  // Адрес юрлица идёт первым и только если его ещё нет среди шаблонов —
  // иначе в списке было бы два одинаковых пункта.
  const options = entityAddress && !known.includes(entityAddress) ? [entityAddress, ...known] : known;
  const alreadySaved = !value.trim() || known.includes(value.trim());

  async function saveTemplate() {
    const address = value.trim();
    if (!address || alreadySaved || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await insertPurchaseDeliveryAddress({ legalEntityId, address, note: '' });
      onAddressesChange([...addresses, created]);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить адрес как шаблон'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {options.length > 0 && (
        <Select
          label="Адрес доставки"
          options={options}
          value={options.includes(value) ? value : ''}
          onChange={onChange}
          placeholder="Выберите сохранённый адрес"
        />
      )}
      <Input
        label={options.length > 0 ? undefined : 'Адрес доставки'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Куда везти"
        helperText={
          entityAddress && value.trim() === entityAddress
            ? 'Адрес объекта из карточки юрлица — тот же, что уходит поставщику во вложении «Информация по доставке»'
            : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        {!alreadySaved && (
          <Button
            type="button"
            variant="ghost"
            icon={<Bookmark className="h-4 w-4" />}
            onClick={() => void saveTemplate()}
            disabled={saving}
          >
            {saving ? 'Сохраняем...' : 'Сохранить как шаблон'}
          </Button>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}
