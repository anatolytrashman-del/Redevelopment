// Автоопределение пола по ФИО для соглашения о намерениях (Гражданин/
// Гражданка) — спрашивать это явным вопросом в форме брони неуместно,
// когда его почти всегда можно вывести из отчества (самый надёжный
// признак для русских/белорусских имён) или, при его отсутствии, из
// окончания фамилии. Возвращает null, если определить не удалось —
// тогда форма оставляет текущий выбор пользователя как есть.
const FEMALE_PATRONYMIC_SUFFIXES = ['овна', 'евна', 'ична', 'инична'];
const MALE_PATRONYMIC_SUFFIXES = ['ович', 'евич', 'ич'];
const FEMALE_SURNAME_SUFFIXES = ['ова', 'ева', 'ина', 'ская', 'цкая'];
const MALE_SURNAME_SUFFIXES = ['ов', 'ев', 'ин', 'ский', 'цкий'];

function endsWithAny(word: string, suffixes: string[]): boolean {
  return suffixes.some((suffix) => word.endsWith(suffix));
}

export function guessGenderFromName(fullName: string): 'Мужчина' | 'Женщина' | null {
  const parts = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  // Отчество (3-е слово в формате Фамилия Имя Отчество) — самый надёжный сигнал.
  if (parts.length >= 3) {
    const patronymic = parts[2];
    if (endsWithAny(patronymic, FEMALE_PATRONYMIC_SUFFIXES)) return 'Женщина';
    if (endsWithAny(patronymic, MALE_PATRONYMIC_SUFFIXES)) return 'Мужчина';
  }

  // Без отчества — грубее, по окончанию фамилии (первое слово).
  const surname = parts[0];
  if (endsWithAny(surname, FEMALE_SURNAME_SUFFIXES)) return 'Женщина';
  if (endsWithAny(surname, MALE_SURNAME_SUFFIXES)) return 'Мужчина';

  return null;
}
