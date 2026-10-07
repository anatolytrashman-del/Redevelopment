// Распознавание referrer ИИ-чатов для собственного счётчика
// (pageViewTracker → search_visits_daily) и подписей в «Показателях».
// Близнец правил — supabase/functions/sync-yandex-metrika (Метрика после cookies).

export const AI_REFERRER_SOURCES = [
  'chatgpt',
  'gemini',
  'alice',
  'copilot',
  'perplexity',
  'claude',
  'grok',
  'you',
] as const;

export type AiReferrerSource = (typeof AI_REFERRER_SOURCES)[number];

const AI_REFERRER_RULES: { source: AiReferrerSource; label: string; match: RegExp }[] = [
  {
    source: 'chatgpt',
    label: 'ChatGPT',
    match: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$|(^|\.)openai\.com$/i,
  },
  {
    source: 'gemini',
    label: 'Gemini',
    match: /(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$|(^|\.)aistudio\.google\.com$/i,
  },
  {
    source: 'alice',
    label: 'Алиса / Яндекс Нейро',
    match: /(^|\.)alice\.yandex\.(ru|by|com)$|(^|\.)dialog\.yandex\.(ru|by)$|(^|\.)neuro\.yandex\.(ru|by)$/i,
  },
  {
    source: 'copilot',
    label: 'Microsoft Copilot',
    // Только copilot.*; обычный bing.com остаётся поисковиком «bing»
    // (hostname без path — отличить /chat от выдачи нельзя).
    match: /(^|\.)copilot\.microsoft\.com$/i,
  },
  {
    source: 'perplexity',
    label: 'Perplexity',
    match: /(^|\.)perplexity\.ai$/i,
  },
  {
    source: 'claude',
    label: 'Claude',
    match: /(^|\.)claude\.ai$/i,
  },
  {
    source: 'grok',
    label: 'Grok',
    match: /(^|\.)grok\.x\.ai$|(^|\.)x\.ai$/i,
  },
  {
    source: 'you',
    label: 'You.com',
    match: /(^|\.)you\.com$/i,
  },
];

export const AI_REFERRER_LABELS: Record<AiReferrerSource, string> = Object.fromEntries(
  AI_REFERRER_RULES.map((r) => [r.source, r.label]),
) as Record<AiReferrerSource, string>;

export function isAiReferrerSource(source: string): source is AiReferrerSource {
  return (AI_REFERRER_SOURCES as readonly string[]).includes(source);
}

export function aiSourceFromHostname(hostname: string): AiReferrerSource | null {
  const host = hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  for (const rule of AI_REFERRER_RULES) {
    if (rule.match.test(host)) return rule.source;
  }
  return null;
}
