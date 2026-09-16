import type { DocumentFile } from './contractorDocuments';

// Входящее письмо на закупочный ящик, которое не удалось привязать ни к
// одной карточке поставщика (шаг 9 плана закупок).
//
// Три способа привязки пробует сам вебхук (api/purchase-email-webhook.js):
// plus-адрес в поле «кому», заголовок In-Reply-To/References со ссылкой на
// наше письмо, и адрес отправителя, если он однозначно ведёт к одной
// карточке. Сюда письмо попадает, когда не сработал ни один — обычно это
// ответ на голый zakupki@ от поставщика, которому писали с нескольких
// карточек сразу, или первое письмо от того, кому мы вообще не писали.
//
// Тело и вложения сохраняются сразу и целиком: ссылки на файлы у Resend
// живут час, и «разберём завтра» означало бы письмо без счёта.
export interface UnmatchedIncomingEmail {
  id: string;
  resendMessageId: string | null;
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  files: DocumentFile[];
  // Заголовки письма целиком — нужны, когда глазами разбирают спорный
  // случай (кому на самом деле отвечал поставщик).
  headers: Record<string, string> | null;
  // Карточки, на которые письмо похоже: тот же адрес отправителя уже
  // встречался в переписке, но однозначно выбрать не вышло (поставщик
  // продаёт и плинтусы, и керамогранит — карточка на каждую категорию своя).
  candidateOfferIds: string[];
  // Разобрано. resolvedOfferId — куда привязали; null при заполненном
  // resolvedAt значит «не по делу, скрыть» (реклама, спам).
  resolvedAt: string | null;
  resolvedOfferId: string | null;
  resolvedByName: string | null;
  createdAt: string;
}

export interface UnmatchedIncomingEmailRow {
  id: string;
  resend_message_id: string | null;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  body: string | null;
  files: DocumentFile[] | null;
  headers: Record<string, string> | null;
  candidate_offer_ids: string[] | null;
  resolved_at: string | null;
  resolved_offer_id: string | null;
  resolved_by_name: string | null;
  created_at: string;
}
