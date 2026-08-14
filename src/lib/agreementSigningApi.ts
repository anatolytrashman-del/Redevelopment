import { supabase } from './supabase';
import { withRetry } from './withRetry';

export interface AgreementOtpRequestInput {
  leadId: string;
  objectId: string;
  zoneId: string;
  zoneArea: number;
  zoneFloorLabel: string;
  buyerName: string;
  buyerGender: 'Мужчина' | 'Женщина';
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
  documentUrl: string;
  verifiedAt: string;
}

// Только завершённые подписания читаемы анонимным ключом (см. RLS-политику
// в SQL для agreement_signatures) — незавершённые с активным кодом скрыты.
export function fetchSignedAgreementsForZones(zoneIds: string[]): Promise<SignedAgreementSummary[]> {
  if (zoneIds.length === 0) return Promise.resolve([]);
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('agreement_signatures')
      .select('zone_id, document_url, verified_at')
      .in('zone_id', zoneIds)
      .not('verified_at', 'is', null);
    if (error) throw error;
    return (data as { zone_id: string; document_url: string; verified_at: string }[]).map((row) => ({
      zoneId: row.zone_id,
      documentUrl: row.document_url,
      verifiedAt: row.verified_at,
    }));
  });
}
