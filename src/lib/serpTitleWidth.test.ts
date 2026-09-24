import { describe, it, expect } from 'vitest';
import { serpTitleWidth, fitsSerpTitle, SERP_TITLE_MAX_PX } from './serpTitleWidth';

// Эталоны сняты 2026-09-22 браузерным замером тех же строк в Arial 20px
// (метрики Liberation Sans, метрически совместимого с Arial). Если таблица
// ширин в модуле когда-нибудь поедет, разойдутся именно эти числа — а
// молча поехавшая таблица означает заголовки, обрезанные в выдаче.
const MEASURED: [string, number][] = [
  ['Бизнес-центр Terrum — полный обзор', 357],
  ['Бизнес-центр Terrum — полный обзор (обновляется ежемесячно)', 614],
  ['Бизнес-центр на Жуковского, 11А — полный обзор', 474],
  ['Бизнес-центры класса B+ в Минске', 330],
  ['Бизнес-центры в Октябрьском районе Минска', 430],
];

describe('serpTitleWidth', () => {
  it('совпадает с браузерным замером с точностью до пикселя', () => {
    for (const [text, expected] of MEASURED) {
      expect(Math.round(serpTitleWidth(text))).toBe(expected);
    }
  });

  // Ширина у кириллицы и латиницы разная при одной длине в символах — из-за
  // этого «считать по 60 знаков» и не работает.
  it('различает одинаковые по длине, но разные по ширине строки', () => {
    expect(serpTitleWidth('шшшшшшшшшш')).toBeGreaterThan(serpTitleWidth('iiiiiiiiii') * 3);
  });

  it('не падает на незнакомом символе', () => {
    expect(serpTitleWidth('Бизнес-центр 🏢')).toBeGreaterThan(0);
  });

  it('fitsSerpTitle отсекает по порогу обрезки', () => {
    expect(fitsSerpTitle('Бизнес-центр Terrum — полный обзор 2026')).toBe(true);
    expect(fitsSerpTitle('Бизнес-центр Terrum — полный обзор (обновляется ежемесячно)')).toBe(false);
    expect(SERP_TITLE_MAX_PX).toBe(600);
  });
});
