// Принимающее лицо — тот, кто физически принимает товар у поставщика и на
// кого выписывается доверенность (владелец, 2026-09-16: «Сущность
// "Принимающее лицо" и его номер телефона, сами лица должны сохраняться в
// базе как шаблоны, они повторяются»).
//
// Почему не people (src/data/people.ts): там исполнители задач и плательщики
// в «Транзакциях», без телефона и без паспорта, и редактируется тот список
// напрямую в базе. Здесь нужен свой — с телефоном, который уходит
// поставщику, и паспортом, без которого не выписать доверенность.
//
// Снимок имени и телефона хранится ещё и в самой поставке
// (PurchaseDelivery.receiverName/receiverPhone): человек может уволиться, а
// поставка обязана остаться читаемой.

export interface PurchaseReceiver {
  id: string;
  // Юрлицо, от которого человек принимает. null — общее лицо для всех.
  legalEntityId: string | null;
  name: string;
  phone: string;
  position: string;
  // Паспортные данные одной строкой — ровно так, как они идут в текст
  // доверенности («паспорт MP1234567, выдан ...»).
  passport: string;
  note: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/purchaseReceiversApi.ts
export interface PurchaseReceiverRow {
  id: string;
  legal_entity_id: string | null;
  name: string;
  phone: string | null;
  position: string | null;
  passport: string | null;
  note: string | null;
  created_at: string;
  deleted_at?: string | null;
}

// Как человека называют в списке выбора: «Степан Ковалёв · +375 29 ...».
// Телефон в подписи не украшение — по нему в списке различают двух
// однофамильцев и видно, что номер вообще заполнен.
export function receiverLabel(receiver: PurchaseReceiver): string {
  return receiver.phone ? `${receiver.name} · ${receiver.phone}` : receiver.name;
}
