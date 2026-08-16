// Сегодняшняя дата в формате YYYY-MM-DD — и для value контролируемого
// <input type="date">, и для отправки в колонки типа date (last_contacted_at,
// next_contact_at).
//
// Собирается из локальных компонент даты, а не через toISOString(): последний
// переводит в UTC, и вечером по минскому времени (UTC+3) вернул бы уже
// сегодняшнюю дату, а ночью — вчерашнюю.
export function todayIsoDate(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
