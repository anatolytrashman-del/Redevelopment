import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BOT_UA_PATTERN, isLikelyBot } from './botDetection';

const HUMAN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

function setNavigator(userAgent: string, webdriver = false) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent, webdriver },
    configurable: true,
  });
}

afterEach(() => {
  delete (globalThis as { __isLikelyBot?: boolean }).__isLikelyBot;
});

describe('isLikelyBot', () => {
  it('верит флагу из index.html, если он уже выставлен', () => {
    setNavigator(HUMAN_UA);
    (globalThis as { __isLikelyBot?: boolean }).__isLikelyBot = true;
    expect(isLikelyBot()).toBe(true);
  });

  it('ловит headless-браузер по navigator.webdriver', () => {
    setNavigator(HUMAN_UA, true);
    expect(isLikelyBot()).toBe(true);
  });

  it('ловит ИИ-краулеров и headless по строке UA', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36',
      'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
      'Mozilla/5.0 (compatible; YandexBot/3.0)',
    ]) {
      setNavigator(ua);
      expect(isLikelyBot(), ua).toBe(true);
    }
  });

  it('не принимает обычный браузер за бота', () => {
    for (const ua of [
      HUMAN_UA,
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    ]) {
      setNavigator(ua);
      expect(isLikelyBot(), ua).toBe(false);
    }
  });
});

// Файл-близнец: та же регулярка инлайном в index.html (счётчики стартуют до
// бандла). Разойдутся — «онлайн» и «Показатели» начнут считать разную
// аудиторию, и по цифрам это не заметить. Тест держит обе копии буква в букву.
describe('index.html', () => {
  it('содержит ровно ту же регулярку определения ботов', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf-8');
    expect(html).toContain(`/${BOT_UA_PATTERN.source}/i.test(navigator.userAgent)`);
  });
});
