import { BynSign } from '../components/ui/BynSign';

// Общие хелперы форматирования чисел в BYN — используются и на странице
// редактирования финмодели (FinModelDetail), и на странице просмотра
// (FinModelReport), чтобы не дублировать.

export function formatNum(value: number): string {
  return Math.round(value).toLocaleString('ru-RU');
}

// Для plain-text мест (title-атрибуты), где SVG-знак рубля не отрисуется.
export function formatByn(value: number): string {
  return `${formatNum(value)} Br`;
}

// Сумма в BYN со знаком рубля (см. BynSign — у знака нет кодовой точки в
// Юникоде, поэтому JSX, а не строка).
export function Byn({ value }: { value: number }) {
  return (
    <span className="whitespace-nowrap">
      {formatNum(value)}&nbsp;
      <BynSign />
    </span>
  );
}
