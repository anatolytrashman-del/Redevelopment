// Пастельная палитра для бейджей (категории транзакций, требования лидов и т.п.).
// Цвет подбирается по хэшу текста, поэтому новые значения автоматически
// получают свой стабильный цвет без правки кода.
const palette: { bg: string; text: string }[] = [
  { bg: '#E3EEFD', text: '#2563A6' }, // синий
  { bg: '#F0E9FB', text: '#6B3FA0' }, // фиолетовый
  { bg: '#E6F6ED', text: '#1AA053' }, // зелёный
  { bg: '#FCEEDD', text: '#B8672A' }, // персиковый
  { bg: '#FCE4EE', text: '#B23B6E' }, // розовый
  { bg: '#DFF5F3', text: '#157A73' }, // бирюзовый
];

export function badgeColor(value: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}
