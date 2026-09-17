import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { DeploymentRow, DeploymentState } from '../data/deployments';

// Облегчённая выборка для страницы метрик: только то, из чего считаются
// плитки. Деплоев много (в сентябре 2026 — 30-120 в день), а страница
// перезапрашивает данные раз в минуту, поэтому и колонок берём минимум, и
// диапазон ограничиваем выбранным периодом — тянуть всю историю на каждый
// тик незачем.
export interface DeploymentMetric {
  deployedAt: string;
  state: DeploymentState;
  commitMessage: string;
  commitRef: string;
}

export function fetchDeploymentMetrics(sinceIso: string): Promise<DeploymentMetric[]> {
  return withRetry(async () => {
    type MetricRow = Pick<DeploymentRow, 'id' | 'deployed_at' | 'state' | 'commit_message' | 'commit_ref'>;
    const rows: MetricRow[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('deployments')
        .select('id, deployed_at, state, commit_message, commit_ref')
        .gte('deployed_at', sinceIso)
        .order('deployed_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(data as MetricRow[]));
      if (data.length < pageSize) break;
    }
    return rows.map((row) => ({
      deployedAt: row.deployed_at,
      state: (row.state as DeploymentState) ?? 'READY',
      commitMessage: row.commit_message ?? '',
      commitRef: row.commit_ref ?? '',
    }));
  });
}
