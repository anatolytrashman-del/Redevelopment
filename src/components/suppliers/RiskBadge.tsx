import { AlertTriangle } from 'lucide-react';
import type { SupplierReliability } from '../../data/supplierReliability';
import { riskSummary, shouldFlag } from '../../data/supplierReliability';

// Восклицательный знак «с этим поставщиком что-то не так». Владелец,
// 2026-09-11: "Такие моменты должны обязательно выводить уведомлением
// восклицательного знака и в списке поставщиков (прям на главной), и в
// сравнении цен, и в переписке" — отсюда отдельный компонент, а не три
// похожих куска разметки: подписи и цвета в трёх местах обязаны совпадать
// (та же причина, по которой в Suppliers.tsx один VerificationBadge на всё).
//
// Сознательно НЕ показываем ничего в двух случаях: когда рисков нет и когда
// проверки не было вовсе (нет ИНН — счёта ещё не присылали). Зелёная
// галочка "всё чисто" рядом с каждым поставщиком превратила бы список в
// шум, а восклицательный знак в нём перестал бы цеплять взгляд — а он
// здесь именно ради этого.
//
// Ошибку проверки тоже не показываем (shouldFlag её отсекает): "не смогли
// проверить" — это не "нашли проблему". Она видна в карточке поставщика,
// где есть место объяснить словами и дать кнопку повтора.
export function RiskBadge({
  inn,
  reliabilityByInn,
  onClick,
}: {
  inn: string | null;
  reliabilityByInn: Map<string, SupplierReliability>;
  // На экранах сравнения значок открывает карточку поставщика, где блок
  // благонадёжности расположен вверху и показывает риски полностью.
  onClick?: () => void;
}) {
  const reliability = inn ? reliabilityByInn.get(inn) ?? null : null;
  if (!shouldFlag(reliability) || !reliability) return null;

  const danger = reliability.riskLevel === 'danger';
  const summary = riskSummary(reliability);
  const className = `inline-flex shrink-0 items-center rounded-sm ${danger ? 'text-danger' : 'text-warning'}`;
  const icon = <AlertTriangle className="h-4 w-4" />;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`Посмотреть риски: ${summary}`}
        aria-label={`Посмотреть риски поставщика: ${summary}`}
        className={`${className} cursor-pointer hover:bg-warning-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning`}
      >
        {icon}
      </button>
    );
  }

  return (
    <span
      // title, а не кастомный тултип: текст рисков может быть длинным
      // ("22736 дел как ответчик, на 571 398 489 297 ₽"), а нативная
      // подсказка браузера переносит его сама и не ломает вёрстку строки
      // списка. Подробности всё равно есть в карточке.
      title={summary}
      aria-label={summary}
      className={className}
    >
      {icon}
    </span>
  );
}
