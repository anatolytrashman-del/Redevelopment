import { describe, expect, it } from 'vitest';
import { aiSourceFromHostname, isAiReferrerSource } from './aiReferrer';

describe('aiReferrer', () => {
  it('распознаёт хосты ИИ-чатов', () => {
    expect(aiSourceFromHostname('chat.openai.com')).toBe('chatgpt');
    expect(aiSourceFromHostname('www.chatgpt.com')).toBe('chatgpt');
    expect(aiSourceFromHostname('gemini.google.com')).toBe('gemini');
    expect(aiSourceFromHostname('alice.yandex.ru')).toBe('alice');
    expect(aiSourceFromHostname('copilot.microsoft.com')).toBe('copilot');
    expect(aiSourceFromHostname('www.perplexity.ai')).toBe('perplexity');
  });

  it('не путает обычный поиск с Copilot', () => {
    expect(aiSourceFromHostname('bing.com')).toBeNull();
    expect(aiSourceFromHostname('www.google.com')).toBeNull();
    expect(aiSourceFromHostname('yandex.by')).toBeNull();
  });

  it('isAiReferrerSource', () => {
    expect(isAiReferrerSource('chatgpt')).toBe(true);
    expect(isAiReferrerSource('google')).toBe(false);
  });
});
