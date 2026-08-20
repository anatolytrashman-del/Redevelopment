import { supabase } from './supabase';
import { withRetry } from './withRetry';

export interface AgreementOtpRequestInput {
  leadId: string;
  objectId: string;
  zoneId: string;
  zoneArea: number;
  zoneFloorLabel: string;
  // Номер/подпись кабинета (например "12") — для соглашения на фиксированное
  // рабочее место (isWorkstation) он подставляется в place of площади.
  zoneLabel: string;
  isWorkstation: boolean;
  buyerName: string;
  buyerGender: 'Мужчина' | 'Женщина';
  buyerCitizenship: 'РБ' | 'РФ';
  buyerPassport: string;
  buyerPassportIssued: string;
  buyerAddress: string;
  email: string;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'error' in err && typeof (err as { error: unknown }).error === 'string') {
    return (err as { error: string }).error;
  }
  return fallback;
}

export async function requestAgreementOtp(input: AgreementOtpRequestInput): Promise<{ signatureId: string }> {
  const resp = await fetch('/api/agreement-otp-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(errorMessage(data, 'Не удалось отправить код'));
  return data;
}

export async function verifyAgreementOtp(signatureId: string, code: string): Promise<{ documentUrl: string }> {
  const resp = await fetch('/api/agreement-otp-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signatureId, code }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(errorMessage(data, 'Не удалось подтвердить код'));
  return data;
}

export interface SignedAgreementSummary {
  zoneId: string;
  // Зона с рабочими местами может иметь несколько подписанных соглашений
  // (по одному на лида) — leadId нужен, чтобы сматчить нужное с нужной бронью.
  leadId: string;
  documentUrl: string;
  verifiedAt: string;
}

// Полная запись подписанного соглашения — для страницы "Документы"
// (автоматический список вместо ручного заведения записи, см. Documents.tsx).
// Как и у SignedAgreementSummary выше, читаются только завершённые подписания.
export interface SignedAgreement {
  id: string;
  leadId: string;
  objectId: string;
  zoneLabel: string;
  isWorkstation: boolean;
  buyerName: string;
  documentUrl: string;
  verifiedAt: string;
  createdAt: string;
}

export function fetchAllSignedAgreements(): Promise<SignedAgreement[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('agreement_signatures')
      .select('id, lead_id, object_id, zone_label, is_workstation, buyer_name, document_url, verified_at, created_at')
      .not('verified_at', 'is', null)
      .order('verified_at', { ascending: false });
    if (error) throw error;
    return (
      data as {
        id: string;
        lead_id: string;
        object_id: string;
        zone_label: string;
        is_workstation: boolean;
        buyer_name: string;
        document_url: string;
        verified_at: string;
        created_at: string;
      }[]
    ).map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      objectId: row.object_id,
      zoneLabel: row.zone_label,
      isWorkstation: row.is_workstation,
      buyerName: row.buyer_name,
      documentUrl: row.document_url,
      verifiedAt: row.verified_at,
      createdAt: row.created_at,
    }));
  });
}

// Только завершённые подписания читаемы анонимным ключом (см. RLS-политику
// в SQL для agreement_signatures) — незавершённые с активным кодом скрыты.
export function fetchSignedAgreementsForZones(zoneIds: string[]): Promise<SignedAgreementSummary[]> {
  if (zoneIds.length === 0) return Promise.resolve([]);
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('agreement_signatures')
      .select('zone_id, lead_id, document_url, verified_at')
      .in('zone_id', zoneIds)
      .not('verified_at', 'is', null);
    if (error) throw error;
    return (data as { zone_id: string; lead_id: string; document_url: string; verified_at: string }[]).map((row) => ({
      zoneId: row.zone_id,
      leadId: row.lead_id,
      documentUrl: row.document_url,
      verifiedAt: row.verified_at,
    }));
  });
}
