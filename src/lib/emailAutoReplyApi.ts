import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type {
  AutoReplyKind,
  AutoReplyMode,
  AutoReplySource,
  AutoReplyDecision,
  AutoReplyReviewAction,
  EmailAutoReplyLogEntry,
  EmailAutoReplyLogRow,
  EmailAutoReplyRule,
  EmailAutoReplyRuleRow,
  EmailAutoReplyRuleStats,
  EmailAutoReplyRuleStatsRow,
  EmailAutoReplySettings,
  EmailAutoReplySettingsRow,
} from '../data/emailAutoReply';
import { DEFAULT_AUTO_REPLY_SIGNATURE } from '../data/emailAutoReply';

function ruleFromRow(row: EmailAutoReplyRuleRow): EmailAutoReplyRule {
  return {
    id: row.id,
    name: row.name,
    criteria: row.criteria ?? '',
    replyKind: (row.reply_kind === 'ai' ? 'ai' : 'template') as AutoReplyKind,
    replySubject: row.reply_subject ?? '',
    replyBody: row.reply_body ?? '',
    mode: (row.mode === 'auto' ? 'auto' : 'draft') as AutoReplyMode,
    requestId: row.request_id,
    enabled: row.enabled,
    priority: row.priority ?? 100,
    source: (row.source === 'learned' ? 'learned' : 'manual') as AutoReplySource,
    originEmailId: row.origin_email_id,
    examples: row.examples ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function logFromRow(row: EmailAutoReplyLogRow): EmailAutoReplyLogEntry {
  return {
    id: row.id,
    emailId: row.email_id,
    ruleId: row.rule_id,
    ruleName: row.rule_name ?? '',
    decision: row.decision as AutoReplyDecision,
    confidence: row.confidence,
    reason: row.reason ?? '',
    draftSubject: row.draft_subject ?? '',
    draftBody: row.draft_body ?? '',
    replyEmailId: row.reply_email_id,
    reviewedAt: row.reviewed_at,
    reviewedAction: (row.reviewed_action as AutoReplyReviewAction | null) ?? null,
    question: row.question ?? '',
    proposal: row.proposal ?? '',
    askedAt: row.asked_at,
    answeredAt: row.answered_at,
    ownerAnswer: row.owner_answer ?? '',
    learnedRuleId: row.learned_rule_id,
    createdAt: row.created_at,
  };
}

type RuleInput = Omit<EmailAutoReplyRule, 'id' | 'createdAt' | 'updatedAt'>;

function ruleToRow(input: RuleInput) {
  return {
    name: input.name,
    criteria: input.criteria,
    reply_kind: input.replyKind,
    reply_subject: input.replySubject,
    reply_body: input.replyBody,
    mode: input.mode,
    request_id: input.requestId,
    enabled: input.enabled,
    priority: input.priority,
    source: input.source,
    origin_email_id: input.originEmailId,
    examples: input.examples,
  };
}

// Счётчики срабатываний — отдельным запросом, а не join'ом к правилам:
// представление считает по всему логу, и подмешивать его в каждую выборку
// правил незачем (модалка автоответов — единственное место, где оно нужно).
export function fetchEmailAutoReplyRuleStats(): Promise<EmailAutoReplyRuleStats[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('email_auto_reply_rule_stats').select('*');
    if (error) throw error;
    return (data as EmailAutoReplyRuleStatsRow[]).map((row) => ({
      ruleId: row.rule_id,
      firedTotal: Number(row.fired_total ?? 0),
      autoSent: Number(row.auto_sent ?? 0),
      drafts: Number(row.drafts ?? 0),
      approvedAsIs: Number(row.approved_as_is ?? 0),
      edited: Number(row.edited ?? 0),
      rejected: Number(row.rejected ?? 0),
      lastFiredAt: row.last_fired_at,
    }));
  });
}

export function fetchEmailAutoReplyRules(): Promise<EmailAutoReplyRule[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('email_auto_reply_rules')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as EmailAutoReplyRuleRow[]).map(ruleFromRow);
  });
}

export function insertEmailAutoReplyRule(input: RuleInput): Promise<EmailAutoReplyRule> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('email_auto_reply_rules').insert(ruleToRow(input)).select().single();
    if (error) throw error;
    return ruleFromRow(data as EmailAutoReplyRuleRow);
  });
}

export function updateEmailAutoReplyRule(id: string, input: RuleInput): Promise<EmailAutoReplyRule> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('email_auto_reply_rules')
      .update({ ...ruleToRow(input), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return ruleFromRow(data as EmailAutoReplyRuleRow);
  });
}

export function deleteEmailAutoReplyRule(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('email_auto_reply_rules').delete().eq('id', id);
    if (error) throw error;
  });
}

// Настройки — ровно одна строка (id=true). Если её вдруг нет (база
// поднята из бэкапа раньше миграции), возвращаем выключенное состояние,
// а не падаем: без строки автоответы просто не работают, это безопасно.
export function fetchEmailAutoReplySettings(): Promise<EmailAutoReplySettings> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('email_auto_reply_settings').select('*').eq('id', true).maybeSingle();
    if (error) throw error;
    const row = data as EmailAutoReplySettingsRow | null;
    return {
      enabled: row?.enabled ?? false,
      minDelayMinutes: row?.min_delay_minutes ?? 20,
      signature: row?.signature ?? DEFAULT_AUTO_REPLY_SIGNATURE,
      followupsEnabled: row?.followups_enabled ?? false,
    };
  });
}

export function updateEmailAutoReplySettings(input: EmailAutoReplySettings): Promise<EmailAutoReplySettings> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('email_auto_reply_settings')
      .upsert(
        {
          id: true,
          enabled: input.enabled,
          min_delay_minutes: input.minDelayMinutes,
          signature: input.signature,
          followups_enabled: input.followupsEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      .select()
      .single();
    if (error) throw error;
    const row = data as EmailAutoReplySettingsRow;
    return {
      enabled: row.enabled,
      minDelayMinutes: row.min_delay_minutes ?? 20,
      signature: row.signature ?? DEFAULT_AUTO_REPLY_SIGNATURE,
      followupsEnabled: row.followups_enabled ?? false,
    };
  });
}

// Черновики, которые ждут решения человека. Отправленные автоматически
// ('sent') и пропущенные ('skipped') сюда не попадают — в переписке они
// видны сами по себе (письмо в ленте) или не видны вовсе.
export function fetchPendingAutoReplies(): Promise<EmailAutoReplyLogEntry[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('email_auto_reply_log')
      .select('*')
      .eq('decision', 'draft')
      .is('reviewed_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as EmailAutoReplyLogRow[]).map(logFromRow);
  });
}

// Черновик разобран человеком: отправлен как есть, отправлен после правки
// или отклонён. Строка остаётся в логе (история решений), но из очереди
// "на проверку" уходит.
export function markAutoReplyReviewed(id: string, action: AutoReplyReviewAction): Promise<EmailAutoReplyLogEntry> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('email_auto_reply_log')
      .update({ reviewed_at: new Date().toISOString(), reviewed_action: action })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return logFromRow(data as EmailAutoReplyLogRow);
  });
}

// Облегчённая выборка лога для страницы метрик (/admin/metrics): только
// решение и время, без текстов черновиков и причин — страница опрашивает
// базу раз в минуту, и тянуть на каждом тике тело каждого черновика
// незачем (тот же принцип, что fetchOutgoingEmailMetrics). Берётся весь
// лог, включая 'skipped': на метриках пропуски — отдельная плитка, чтобы
// было видно, сколько писем ИИ-закупщик разобрал, а не только сколько
// ответил.
export interface AutoReplyLogMetric {
  decision: AutoReplyDecision;
  reviewedAction: AutoReplyReviewAction | null;
  createdAt: string;
}

export function fetchAutoReplyLogMetrics(): Promise<AutoReplyLogMetric[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('email_auto_reply_log')
      .select('decision, reviewed_action, created_at')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as Pick<EmailAutoReplyLogRow, 'decision' | 'reviewed_action' | 'created_at'>[]).map((row) => ({
      decision: row.decision as AutoReplyDecision,
      reviewedAction: (row.reviewed_action as AutoReplyReviewAction | null) ?? null,
      createdAt: row.created_at,
    }));
  });
}
