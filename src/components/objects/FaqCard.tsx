import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';

interface FaqItem {
  question: string;
  answer: string;
}

// Пока продающая страница только у одного шаблона (см. MIN_ROOM_AREA в
// ObjectLandingPage.tsx) — контент общий для всех объектов, не поле в базе.
// Google отключил FAQ rich results (май 2026), но сам контент стал важнее —
// его цитируют AI-системы, разметку читают Яндекс и Bing (см. SEO_PLAN.md,
// Э1-7) — поэтому нужен и видимый блок, не только JSON-LD (setFaqJsonLd в
// pageMeta.ts, вызывается из ObjectLandingPage тем же списком).
export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Сколько стоит кабинет или рабочее место?',
    answer:
      'Кабинеты — от $23 100 (от 11 м², $2100 за м², большая площадь — цена выше пропорционально). Фиксированное рабочее место в общем кабинете — $12 000.',
  },
  {
    question: 'Что входит в отделку?',
    answer: 'Полная финишная чистовая отделка — кабинет готов к работе. Мебель не входит.',
  },
  {
    question: 'Есть ли парковка?',
    answer: 'Да, много бесплатных парковочных мест вокруг здания. Фиксированных (закреплённых) мест нет.',
  },
  {
    question: 'Как забронировать кабинет?',
    answer:
      'Выберите кабинет на плане на этой странице и подпишите соглашение о намерениях онлайн — кодом из email, без визита в офис и без предоплаты.',
  },
  {
    question: 'Можно ли купить в рассрочку, лизинг или кредит?',
    answer:
      'Да. Рассрочка — взнос 25%, срок 4 месяца. Лизинг (ИП и юрлица) — взнос от 10%, срок до 10 лет. Кредит (ИП и юрлица) — взнос от 20%, срок до 20 лет, финансирование от банков-партнёров.',
  },
  {
    question: 'Можно ли зарегистрировать юридический адрес на кабинет?',
    answer: 'Да, можно зарегистрировать юридический адрес компании на приобретённый кабинет или рабочее место.',
  },
];

// <details>/<summary> вместо аккордеона на useState: контент есть в DOM
// независимо от открыт/закрыт (важно для краулеров), не нужен JS-стейт.
export function FaqCard() {
  return (
    <div className={cn('flex flex-col gap-4 p-6', glassCardClass)} style={glassCardShadow}>
      <h2 className="text-xl font-extrabold text-ink">Частые вопросы</h2>
      <div className="flex flex-col divide-y divide-border">
        {FAQ_ITEMS.map((item) => (
          <details key={item.question} className="py-3 first:pt-0 last:pb-0">
            <summary className="cursor-pointer text-sm font-semibold text-ink">{item.question}</summary>
            <p className="mt-2 text-sm text-ink-muted">{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
