// Организации по домам Минск Мира — вкладка "Дома" на /admin/market-offers
// (MarketOffersReview.tsx). Заменяет ручную пересылку списков от Светланы
// в код (см. журнал CLAUDE.md, 2026-08-26): Светлана выгружает список
// организаций дома с Яндекс.Карт в текстовый файл и загружает его прямо в
// эту вкладку — дальше уже система сама разбирает файл и обновляет список
// (добавляет новые, убирает те, что пропали из выгрузки — считаем закрытыми).
//
// externalId — пусто для записей, добавленных через загрузку файла (у
// Светланы нет доступа к внутренним id организаций Яндекса, только видимый
// список названий) — уникальность обеспечивает street+house+title, не
// externalId. Если позже заработает автоматический сбор через
// scripts/sync-district-business-points.mjs (сейчас не работает, IP с
// GitHub Actions банится Яндексом — см. журнал), эти записи будут жить
// в одной таблице бок о бок с ручными.
export interface DistrictBusinessPoint {
  id: string;
  externalId: string | null;
  title: string;
  rawCategory: string | null;
  address: string | null;
  street: string;
  house: string;
  quarterId: string;
  lat: number | null;
  lon: number | null;
  status: string | null;
  lastSeenAt: string;
  createdAt: string;
}

export interface DistrictBusinessPointRow {
  id: string;
  external_id: string | null;
  title: string;
  raw_category: string | null;
  address: string | null;
  street: string;
  house: string;
  quarter_id: string;
  lat: number | null;
  lon: number | null;
  status: string | null;
  last_seen_at: string;
  created_at: string;
}
