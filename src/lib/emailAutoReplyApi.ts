import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type {
  AutoReplyKind,
  AutoReplyMode,
  AutoReplyDecision,
  AutoReplyReviewAction,
  EmailAutoReplyLogEntry,
  EmailAutoReplyLogRow,
  EmailAutoReplyRule,
  EmailAutoReplyRuleRow,
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
  };
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
