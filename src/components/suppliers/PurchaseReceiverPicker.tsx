import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { receiverLabel, type PurchaseReceiver } from '../../data/purchaseReceivers';
import { insertPurchaseReceiver, updatePurchaseReceiver } from '../../lib/purchaseReceiversApi';

// Выбор принимающего лица + правка его данных. Один и тот же блок нужен в
// двух местах — на карточке заказа (ответственный за приёмку по заказу) и в
// форме поставки (кто принял эту машину), — поэтому живёт отдельно, а не
// внутри одного из них.
//
// Лица — шаблоны: они повторяются от поставки к поставке (владелец,
// 2026-09-16). Новое заводится прямо здесь: отдельная страница-справочник,
// куда надо сходить, чтобы потом выбрать человека в заказе, — это лишний
// шаг ради одного поля.

const NEW_RECEIVER = 'Новое лицо…';

export interface ReceiverDraft {
  // null — лицо ещё не сохранено как шаблон (его вводят прямо сейчас).
  receiverId: string | null;
  name: string;
  phone: string;
  position: string;
  passport: string;
}

export const EMPTY_RECEIVER_DRAFT: ReceiverDraft = {
  receiverId: null,
  name: '',
  phone: '',
  position: '',
  passport: '',
};

export function receiverDraftFrom(receiver: PurchaseReceiver | null | undefined): ReceiverDraft {
  if (!receiver) return EMPTY_RECEIVER_DRAFT;
  return {
    receiverId: receiver.id,
    name: receiver.name,
    phone: receiver.phone,
    position: receiver.position,
    passport: receiver.passport,
  };
}

// Сохранение шаблона: новое лицо заводится, у существующего подхватываются
// правки (это тот же человек, у которого уточнили телефон или паспорт).
// Возвращает id для записи в заказ/поставку и обновлённый список шаблонов —
// вызывающая сторона кладёт его в свой стейт.
export async function persistReceiverDraft(
  draft: ReceiverDraft,
  receivers: PurchaseReceiver[],
  legalEntityId: string | null,
): Promise<{ receiverId: string | null; receivers: PurchaseReceiver[] }> {
  const name = draft.name.trim();
  if (!name) return { receiverId: null, receivers };

  const payload = {
    legalEntityId,
    name,
    phone: draft.phone.trim(),
    position: draft.position.trim(),
    passport: draft.passport.trim(),
    note: '',
  };
  const template = receivers.find((r) => r.id === draft.receiverId) ?? null;

  if (!template) {
    const created = await insertPurchaseReceiver(payload);
    return { receiverId: created.id, receivers: [...receivers, created] };
  }

  const changed =
    template.name !== payload.name ||
    template.phone !== payload.phone ||
    template.position !== payload.position ||
    template.passport !== payload.passport;
  if (!changed) return { receiverId: template.id, receivers };

  const updated = await updatePurchaseReceiver(template.id, { ...payload, note: template.note });
  return { receiverId: updated.id, receivers: receivers.map((r) => (r.id === updated.id ? updated : r)) };
}

export function ReceiverPicker({
  label = 'Ответственный за приёмку',
  receivers,
  value,
  onChange,
}: {
  label?: string;
  receivers: PurchaseReceiver[];
  value: ReceiverDraft;
  onChange: (next: ReceiverDraft) => void;
}) {
  const template = receivers.find((r) => r.id === value.receiverId) ?? null;

  function pick(picked: string) {
    if (picked === NEW_RECEIVER) {
      onChange(EMPTY_RECEIVER_DRAFT);
      return;
    }
    const found = receivers.find((r) => receiverLabel(r) === picked);
    if (found) onChange(receiverDraftFrom(found));
  }

  return (
    <div className="flex flex-col gap-3">
      <Select
        label={label}
        options={[...receivers.map(receiverLabel), NEW_RECEIVER]}
        value={template ? receiverLabel(template) : value.name}
        onChange={pick}
        placeholder="Выберите или заведите нового"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="ФИО"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Кто принимает"
        />
        <Input
          label="Телефон"
          value={value.phone}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
          placeholder="+375 29 ..."
          helperText="По нему поставщик звонит при доставке"
        />
        <Input label="Должность" value={value.position} onChange={(e) => onChange({ ...value, position: e.target.value })} />
        <Input
          label="Паспорт"
          value={value.passport}
          onChange={(e) => onChange({ ...value, passport: e.target.value })}
          placeholder="MP1234567, выдан ..."
          helperText="Нужен для доверенности"
        />
      </div>
      <p className="text-xs text-ink-faint">
        Лицо сохраняется как шаблон: в следующем заказе его достаточно выбрать из списка.
      </p>
    </div>
  );
}
