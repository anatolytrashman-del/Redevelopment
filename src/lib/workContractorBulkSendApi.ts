import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { getCurrentProfile } from './accessProfile';
import type { EmailAttachment } from './legalEntityAttachment';
import type { WorkContractorBulkSendJob, WorkContractorBulkSendJobRow } from '../data/workContractorBulkSend';

function fromRow(row: WorkContractorBulkSendJobRow): WorkContractorBulkSendJob {
  return {
    id: row.id,
    category: row.category,
    subject: row.subject,
    body: row.body,
    attachment: row.attachment,
    status: row.status === 'done' ? 'done' : 'queued',
    createdByProfileId: row.created_by_profile_id ?? null,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
  };
}

// Ставит задание на массовую рассылку в очередь — саму отправку разбирает
// Edge Function process-work-contractor-bulk-send-jobs по pg_cron (раз в
// минуту), без ручного дёргателя с фронта (в отличие от dispatchBulkSendWorkflow
// у поставщиков, который упирался в затроттленный GitHub Actions).
// contractorIds — уже отфильтрованные по категории получатели с непустым email.
export function insertWorkContractorBulkSendJob(input: {
  category: string;
  subject: string;
  body: string;
  attachment: EmailAttachment | null;
  contractorIds: string[];
}): Promise<WorkContractorBulkSendJob> {
  return withRetry(async () => {
    const profile = getCurrentProfile();
    const { data: jobData, error: jobError } = await supabase
      .from('work_contractor_bulk_send_jobs')
      .insert({
        category: input.category,
        subject: input.subject,
        body: input.body,
        attachment: input.attachment,
        created_by_profile_id: profile.id,
        created_by_name: profile.displayName,
      })
      .select()
      .single();
    if (jobError) throw jobError;
    const job = fromRow(jobData as WorkContractorBulkSendJobRow);

    const { error: itemsError } = await supabase
      .from('work_contractor_bulk_send_job_items')
      .insert(input.contractorIds.map((contractorId) => ({ job_id: job.id, contractor_id: contractorId })));
    if (itemsError) throw itemsError;

    return job;
  });
}

// Подрядчики, которым письмо УЖЕ поставлено в очередь, но воркер до них ещё
// не дошёл (между постановкой в очередь и последним письмом на 30 подрядчиков
// уходит порядка 15 минут) — без этого списка повторная рассылка по той же
// категории отправила бы части подрядчиков дубль.
export function fetchQueuedWorkContractorBulkSendContractorIds(): Promise<string[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('work_contractor_bulk_send_job_items')
      .select('contractor_id')
      .in('status', ['pending', 'sending']);
    if (error) throw error;
    return (data as { contractor_id: string }[]).map((r) => r.contractor_id);
  });
}
