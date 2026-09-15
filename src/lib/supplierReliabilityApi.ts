import { supabase } from './supabase';
import { authFetch } from './authFetch';
import { withRetry } from './withRetry';
import type {
  RiskFlag,
  RiskLevel,
  SupplierReliability,
  SupplierReliabilityCheck,
  SupplierReliabilityCheckRow,
  SupplierReliabilityRow,
} from '../data/supplierReliability';

function fromRow(row: SupplierReliabilityRow): SupplierReliability {
  return {
    id: row.id,
    inn: row.inn,
    found: row.found,
    riskLevel: (row.risk_level as RiskLevel) || 'ok',
    risks: Array.isArray(row.risks) ? row.risks : [],
    company: row.company,
    legalCases: row.legal_cases,
    enforcements: row.enforcements,
    error: row.error,
    checkedAt: row.checked_at,
  };
}

// Все проверки разом, раскладка по ИНН на клиенте — тот же принцип, что и
// у fetchSupplierOffers: записей заведомо немного (по одной на юрлицо, а не
// на предложение), отдельный запрос на каждого поставщика не нужен.
export function fetchSupplierReliability(): Promise<SupplierReliability[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('supplier_reliability').select('*');
    if (error) throw error;
    return (data as SupplierReliabilityRow[]).map(fromRow);
  });
}

interface CheckResponse {
  found: boolean;
  risks: RiskFlag[];
  riskLevel: RiskLevel;
  company: Record<string, unknown> | null;
  legalCases: Record<string, unknown> | null;
  enforcements: Record<string, unknown> | null;
}

// Проверить ИНН и сохранить результат. Ключ Checko живёт только в env
// Vercel, поэтому сам запрос в Checko идёт через серверный action, а не из
// браузера (см. api/supplier-web-search.js, action:'check-reliability').
//
// История проверок этой компании, новые сверху (страница поставщика, шаг 4).
// Записи создаёт триггер supplier_reliability_log_check при каждой записи в
// supplier_reliability — включая неудачные попытки: «не смогли проверить» в
// истории видно так же, как удачную проверку, иначе пропуск выглядел бы как
// «не пробовали».
export function fetchSupplierReliabilityChecks(supplierId: string): Promise<SupplierReliabilityCheck[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_reliability_checks')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('checked_at', { ascending: false });
    if (error) throw error;
    return (data as SupplierReliabilityCheckRow[]).map((row) => ({
      id: row.id,
      supplierId: row.supplier_id,
      inn: row.inn,
      found: row.found,
      riskLevel: row.risk_level as SupplierReliabilityCheck['riskLevel'],
      risks: row.risks ?? [],
      error: row.error,
      checkedAt: row.checked_at,
    }));
  });
}

// Запись кладём upsert'ом по ИНН: повторная проверка того же юрлица должна
// обновлять существующую строку, а не плодить историю — нам нужно текущее
// состояние, а не архив (если понадобится история, это отдельная таблица,
// а не дубли в этой).
export async function checkSupplierReliability(inn: string): Promise<SupplierReliability> {
  let payload: CheckResponse | null = null;
  let failure: string | null = null;
  try {
    const resp = await authFetch('/api/supplier-web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check-reliability', inn }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `Ошибка проверки (${resp.status})`);
    payload = data.result as CheckResponse;
  } catch (err) {
    // Сбой проверки тоже сохраняем — иначе кнопка "Проверить" выглядит
    // молча сломанной, а закупщица не понимает, проверяли ли вообще.
    failure = err instanceof Error ? err.message : 'Не удалось проверить поставщика';
  }

  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_reliability')
      .upsert(
        {
          inn,
          found: payload?.found ?? false,
          risk_level: payload?.riskLevel ?? 'ok',
          risks: payload?.risks ?? [],
          company: payload?.company ?? null,
          legal_cases: payload?.legalCases ?? null,
          enforcements: payload?.enforcements ?? null,
          error: failure,
          checked_at: new Date().toISOString(),
        },
        { onConflict: 'inn' },
      )
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as SupplierReliabilityRow);
  });
}
