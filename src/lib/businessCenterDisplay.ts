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

// Короткий адрес для карточки хаба — владелец: "без «г. Минск», без района,
// только конкретный адрес, улица и дом. Где непонятно, подскажу" (полный
// адрес — на отдельной странице БЦ, там сокращать не нужно). Чисто
// синтаксическая обрезка, без хардкода по конкретным БЦ: снимает ведущий
// "г. Минск, "/"Минская область, ", затем ведущий "<Название> район, " —
// сработало на всех 27 текущих адресах без единого неоднозначного случая
// (включая "Аден" — тот не в Минске вовсе, у него снимается "Минская
// область, Смолевичский район, ", остаётся "индустриальный парк «Великий
// камень», Пекинский проспект, 31"; и МФЦ — стройка без номера дома,
// остаётся "проспект Мира, район «Минск Мир»", это и есть весь адрес).
export function shortAddress(fullAddress: string): string {
  return fullAddress
    .replace(/^г\.\s*Минск,\s*/i, '')
    .replace(/^Минская\s+область,\s*/i, '')
    .replace(/^[А-ЯЁ][а-яё]+\s+район,\s*/, '')
    .trim();
}

// Порядок для навигации "следующий/предыдущий БЦ" на отдельной странице —
// тот же алфавит по короткому имени, что и в боковом меню хаба, чтобы
// стрелки совпадали с порядком, который пользователь уже видел в списке.
export function sortByShortName(centers: BusinessCenter[]): BusinessCenter[] {
  return [...centers].sort((a, b) => shortName(a).localeCompare(shortName(b), 'ru'));
}
