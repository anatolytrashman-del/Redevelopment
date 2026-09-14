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
}

export function fetchDeploymentMetrics(sinceIso: string): Promise<DeploymentMetric[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('deployments')
      .select('deployed_at, state, commit_message')
      .gte('deployed_at', sinceIso)
      .order('deployed_at', { ascending: true });
    if (error) throw error;
    return (data as Pick<DeploymentRow, 'deployed_at' | 'state' | 'commit_message'>[]).map((row) => ({
      deployedAt: row.deployed_at,
      state: (row.state as DeploymentState) ?? 'READY',
      commitMessage: row.commit_message ?? '',
    }));
  });
}
