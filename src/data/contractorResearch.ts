// Вкладка "Ресерч" на странице Подрядчики — сравнение предложений разных
// исполнителей на одну задачу (владелец: "поиск оценки здания" — пример
// запроса). Один запрос (ResearchRequest) — одна карточка, внутри неё
// список предложений (ResearchOffer) от разных подрядчиков. Дешевле всех —
// автоматически наверх и подсвечено зелёным (см. cheapestOfferId в
// ContractorsResearch.tsx) — владелец выбирает чаще всего по цене.
export interface ResearchRequest {
  id: string;
  title: string;
  createdAt: string;
}

export interface ResearchRequestRow {
  id: string;
  title: string;
  created_at: string;
}

export interface ResearchOffer {
  id: string;
  requestId: string;
  name: string;
  phone: string;
  price: number;
  deadline: string;
  requirements: string;
  createdAt: string;
}

export interface ResearchOfferRow {
  id: string;
  request_id: string;
  name: string;
  phone: string;
  price: number;
  deadline: string;
  requirements: string;
  created_at: string;
}
