import type { BusinessCenter } from '../data/businessCenters';

// Общие мелкие хелперы отображения БЦ — используются и на хабе
// (BusinessCentersMinskPage.tsx), и на отдельной странице конкретного БЦ
// (BusinessCenterDetailPage.tsx), поэтому вынесены в один файл, а не
// продублированы (см. CLAUDE.md про подобные дубли — тут повода нет,
// страницы всегда монтируются вместе в рамках одного SPA-бандла).
export const businessClassTone: Record<NonNullable<BusinessCenter['businessClass']>, 'primary' | 'success' | 'neutral'> = {
  A: 'primary',
  'B+': 'success',
  B: 'neutral',
  C: 'neutral',
};

// Короткое имя без "Бизнес-центр «...»" — для бокового меню, карточек хаба
// и заголовка отдельной страницы (владелец: "БЦ по алфавиту, но без
// «Бизнес-Центр», просто названия").
export function shortName(center: BusinessCenter): string {
  if (center.slug === 'mfc-minsk-mir') return 'МФЦ (Минск Мир)';
  const quoted = center.name.match(/«([^»]+)»/);
  if (quoted) return quoted[1];
  const paren = center.name.match(/\(([^)]+)\)/);
  if (paren) return paren[1];
  return center.name;
}

// Порядок для навигации "следующий/предыдущий БЦ" на отдельной странице —
// тот же алфавит по короткому имени, что и в боковом меню хаба, чтобы
// стрелки совпадали с порядком, который пользователь уже видел в списке.
export function sortByShortName(centers: BusinessCenter[]): BusinessCenter[] {
  return [...centers].sort((a, b) => shortName(a).localeCompare(shortName(b), 'ru'));
}
