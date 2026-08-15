import { useState, type ElementType } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, X } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { IntentAgreementDocument } from './IntentAgreementDocument';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { ObjectDocumentFile } from '../../data/objects';

// Тот же id стоит на обёртке PublicPlanAndUnits — кнопка "Выбрать кабинет"
// здесь просто скроллит к нему, без прокидывания рефов между соседними
// компонентами страницы.
export const PLAN_AND_UNITS_ANCHOR_ID = 'plan-and-units';

interface BookingTermsCardProps {
  agreement: ObjectDocumentFile | null;
  // Только для черновика продающей страницы (/:slug/draft) — см.
  // src/lib/glass.ts. По умолчанию выключено, чтобы не задеть другие
  // места, где используется этот компонент.
  glass?: boolean;
}

interface Step {
  title: string;
  description: string;
}

const steps: Step[] = [
  { title: 'Выберите кабинет', description: 'В списке или на плане выше' },
  { title: 'Прочитайте соглашение', description: '2 страницы, без сложных терминов' },
  { title: 'Забронируйте онлайн', description: 'Подтверждение по email. Без визитов в офис и оплаты.' },
];

// Блок-закрыватель сомнений, а не справка: раньше был статичным списком
// фактов рядом с иконкой документа, теперь — путь из 3 шагов, где клиент
// всегда "на первом" (сам блок не отслеживает реальный прогресс брони, это
// общий призыв "вот как легко", а не трекер конкретной заявки). Стоит под
// общим блоком план+список (см. ObjectLandingDraftPage) — сначала клиент
// смотрит кабинеты, потом здесь снимаем тревогу и ведём назад к брони.
// Главная кнопка брони — на 3-м шаге (а не на 1-м): бронь физически нельзя
// начать без выбора конкретного кабинета (форма живёт в модалке кабинета
// в PublicPlanAndUnits), так что и там, и там кнопка ведёт к списку — но на
// 3-м шаге это финальный, самый заметный призыв после всего объяснения, а
// не дубль. Шаг 1 — только лёгкая ссылка-подсказка "куда смотреть".
export function BookingTermsCard({ agreement, glass }: BookingTermsCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const Wrapper: ElementType = glass ? 'div' : Card;

  function scrollToUnits() {
    document.getElementById(PLAN_AND_UNITS_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Из превью соглашения — не просто закрыть модалку, а сразу отправить
  // читателя дальше по воронке. Скролл — на следующий тик, после того как
  // модалка реально уйдёт из DOM, а не в том же обработчике, что её закрывает.
  function handleProceedFromPreview() {
    setPreviewOpen(false);
    requestAnimationFrame(scrollToUnits);
  }

  return (
    <Wrapper className={cn('flex flex-col gap-6 p-6', glass && glassCardClass)} style={glass ? glassCardShadow : undefined}>
      <div className="flex flex-col gap-1">
        <div className="text-xl font-extrabold text-ink">Онлайн-бронирование без предоплаты</div>
        <p className="text-sm text-ink-muted">Бронь ни к чему не обязывает — вот как это устроено</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {steps.map((step, i) => {
          const isCurrent = i === 0;
          return (
            <div key={step.title} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    isCurrent ? 'bg-primary text-white' : 'border-2 border-border text-ink-faint',
                  )}
                >
                  {i + 1}
                </span>
                <span className={cn('text-sm font-semibold', isCurrent ? 'text-ink' : 'text-ink-muted')}>
                  {step.title}
                </span>
              </div>
              <div className="flex flex-col gap-2 pl-10">
                <p className="text-xs text-ink-faint">{step.description}</p>
                {i === 0 && (
                  <button
                    type="button"
                    onClick={scrollToUnits}
                    className="w-fit text-xs font-semibold text-primary hover:underline"
                  >
                    Смотреть кабинеты ↑
                  </button>
                )}
                {i === 1 &&
                  (agreement ? (
                    <Button
                      type="button"
                      variant="secondary"
                      icon={<FileText className="h-4 w-4" />}
                      onClick={() => setPreviewOpen(true)}
                      className="w-fit whitespace-nowrap"
                    >
                      Посмотреть шаблон
                    </Button>
                  ) : (
                    <p className="text-xs text-ink-faint">Шаблон соглашения скоро появится здесь.</p>
                  ))}
                {i === 2 && (
                  <Button type="button" onClick={scrollToUnits} className="w-fit whitespace-nowrap">
                    Забронировать кабинет
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {previewOpen &&
        agreement &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setPreviewOpen(false)} />
            <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-ink">Соглашение о намерениях</span>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={agreement.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-primary"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Скачать
                  </a>
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(false)}
                    aria-label="Закрыть"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto rounded-control bg-surface-muted p-3 sm:p-6">
                <IntentAgreementDocument />
              </div>
              <div className="flex flex-col items-start gap-1 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-ink-faint">Согласны с условиями? Выберите кабинет и подпишите онлайн.</p>
                <Button type="button" onClick={handleProceedFromPreview} className="w-fit shrink-0 whitespace-nowrap">
                  Забронировать кабинет
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </Wrapper>
  );
}
