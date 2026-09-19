import type { EmailAttachment } from '../lib/legalEntityAttachment';

// Массовая рассылка подрядчикам по категории (владелец, 2026-09-19:
// "сделай мне возможность массовой отправки письма по категории, включая
// прикрепление файла"). Пара таблиц-очереди по образцу data/bulkSendJobs.ts
// (поставщики), но не переиспользует их: там bulk_send_job_items.offer_id
// not null и концептуально привязан к supplier_research_offers — подрядчика
// в неё не положить без правки чужой схемы. Разбирает очередь Edge Function
// process-work-contractor-bulk-send-jobs, тем же темпом рассылки (25-35с
// между письмами), что и у поставщиков — pg_cron дёргает её раз в минуту,
// отдельного триггера с фронта (в отличие от dispatchBulkSendWorkflow у
// поставщиков) не нужно.
export interface WorkContractorBulkSendJob {
  id: string;
  category: string;
  subject: string;
  body: string;
  attachment: EmailAttachment | null;
  status: 'queued' | 'done';
  createdByProfileId: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface WorkContractorBulkSendJobRow {
  id: string;
  category: string;
  subject: string;
  body: string;
  attachment: EmailAttachment | null;
  status: string;
  created_by_profile_id: string | null;
  created_by_name: string | null;
  created_at: string;
}

export type WorkContractorBulkSendItemStatus = 'pending' | 'sending' | 'sent' | 'error' | 'cancelled';

export interface WorkContractorBulkSendItemRow {
  id: string;
  job_id: string;
  contractor_id: string;
  status: WorkContractorBulkSendItemStatus;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}
