import type { Currency } from './transactions';

// Валюты, в которых подрядчик может назвать цену — то же трио, что и в
// остальном проекте (Транзакции, Сметы): USD/RUB/BYN. Без EUR — владелец
// явно сузил список для этой вкладки ("как и везде, USD/RUB/BYN"), хотя
// общий тип Currency (data/transactions.ts) шире.
export const RESEARCH_CURRENCIES: Currency[] = ['USD', 'RUB', 'BYN'];

// Способ связи с исполнителем — только два варианта (владелец: "либо
// телефон и его номер, либо телега и ник"), не весь список
// contractorContactMethods (data/contractors.ts). Значения — те же строки,
// что там и в ContactValue.tsx ("Telegram" узнаётся именно по этому
// значению для построения t.me-ссылки), чтобы переиспользовать компонент
// без переходников.
export const RESEARCH_CONTACT_METHODS = ['Телефон', 'Telegram'] as const;
export type ResearchContactMethod = (typeof RESEARCH_CONTACT_METHODS)[number];

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
  contact: string;
  contactMethod: ResearchContactMethod;
  price: number;
  currency: Currency;
  deadline: string;
  requirements: string;
  createdAt: string;
}

export interface ResearchOfferRow {
  id: string;
  request_id: string;
  name: string;
  contact: string;
  contact_method: string;
  price: number;
  currency: string;
  deadline: string;
  requirements: string;
  created_at: string;
}
