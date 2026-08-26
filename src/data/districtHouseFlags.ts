// Отметка на вкладке "Дома" (DistrictBusinessesTab.tsx) — дом формально уже
// в справочнике застройщика (см. getDeliveredHouses в districtQuarters.ts),
// но у него закономерно 0 организаций по одной из двух разных причин:
// - 'not_commissioned' — дом ещё физически пустует (не введён в
//   эксплуатацию), организаций там в принципе быть не может, поэтому
//   загрузка выгрузки для него скрыта совсем.
// - 'no_commerce_yet' — дом уже сдан и заселён, но открытых коммерческих
//   помещений там пока нет (владелец, 2026-08-26) — в отличие от первого
//   случая, тут стоит периодически перепроверять выгрузкой, поэтому
//   загрузка остаётся доступной.
// Без отметки такой дом неотличим в списке от "ещё не собрано" (дом уже
// заселён, просто руки не дошли выгрузить организации) — Светлане и
// владельцу непонятно, надо ли его вообще собирать. Наличие строки в
// таблице = дом отмечен; конкретную причину несёт status.
export type DistrictHouseFlagStatus = 'not_commissioned' | 'no_commerce_yet';

export interface DistrictHouseFlag {
  id: string;
  street: string;
  house: string;
  quarterId: string;
  status: DistrictHouseFlagStatus;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/districtHouseFlagsApi.ts
export interface DistrictHouseFlagRow {
  id: string;
  street: string;
  house: string;
  quarter_id: string;
  status: string;
  created_at: string;
}
