// Приводим любой ввод (с +375, с ведущим 80, без кода страны, с пробелами/
// скобками/дефисами вперемешку) к единому читаемому виду +375 (29) 311-41-23.
// Формат чисто для отображения — то, что хранится в базе/форме, не трогаем.
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return phone;
  let digits = phone.replace(/\D/g, '');

  if (digits.startsWith('80') && digits.length === 11) digits = digits.slice(2);
  else if (digits.startsWith('375') && digits.length === 12) digits = digits.slice(3);

  if (digits.length !== 9) return phone;

  const op = digits.slice(0, 2);
  const p1 = digits.slice(2, 5);
  const p2 = digits.slice(5, 7);
  const p3 = digits.slice(7, 9);
  return `+375 (${op}) ${p1}-${p2}-${p3}`;
}
