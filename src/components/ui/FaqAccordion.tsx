import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';

export interface FaqItem {
  question: string;
  answer: string;
}

// <details>/<summary> вместо аккордеона на useState: контент есть в DOM
// независимо от открыт/закрыт (важно для краулеров), не нужен JS-стейт.
// Вынесено из FaqCard.tsx (объект Red One) — тот же виджет нужен и на
// контентных страницах вроде DistrictGuidePage, каждая держит свой список
// вопросов и свою JSON-LD-разметку (setFaqJsonLd), общая только вёрстка.
export function FaqAccordion({ title, items, id }: { title: string; items: FaqItem[]; id?: string }) {
  return (
    <div id={id} className={cn('flex flex-col gap-4 p-6 scroll-mt-6', glassCardClass)} style={glassCardShadow}>
      <h2 className="text-xl font-extrabold text-ink">{title}</h2>
      <div className="flex flex-col divide-y divide-border">
        {items.map((item) => (
          <details key={item.question} className="py-3 first:pt-0 last:pb-0">
            <summary className="cursor-pointer text-sm font-semibold text-ink">{item.question}</summary>
            <p className="mt-2 text-sm text-ink-muted">{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
