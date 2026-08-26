// Отметка "дом не введён в эксплуатацию" на вкладке "Дома"
// (DistrictBusinessesTab.tsx) — дом формально уже в справочнике застройщика
// (см. getDeliveredHouses в districtQuarters.ts), но по факту ещё пустует,
// поэтому у него закономерно 0 организаций. Без этой отметки такой дом
// неотличим в списке от "ещё не собрано" (дом уже заселён, просто руки не
// дошли выгрузить организации) — Светлане и владельцу непонятно, надо ли
// его вообще собирать. Наличие строки в таблице = дом отмечен; своего
// булева поля нет — сама запись и есть отметка (снять — просто удалить).
export interface DistrictHouseFlag {
  id: string;
  street: string;
  house: string;
  quarterId: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/districtHouseFlagsApi.ts
export interface DistrictHouseFlagRow {
  id: string;
  street: string;
  house: string;
  quarter_id: string;
  created_at: string;
}
