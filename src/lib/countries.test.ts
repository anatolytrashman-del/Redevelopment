import { describe, expect, it } from 'vitest';
import { countryFlag, countryLabel, countryName } from './countries';

describe('countries', () => {
  it('флаг и русское название', () => {
    expect(countryFlag('us')).toBe('🇺🇸');
    expect(countryName('DE')).toBe('Германия');
    expect(countryLabel('US')).toBe('🇺🇸 США');
    expect(countryLabel('RU')).toBe('🇷🇺 Россия');
  });
  it('пустой или кривой код', () => {
    expect(countryLabel('')).toBe('🌐 Не определена');
    expect(countryName('XYZ')).toBe('Не определена');
  });
});
