import { useState, type ElementType } from 'react';
import { Check, Download, FileText, X } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { IntentAgreementDocument } from './IntentAgreementDocument';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { ObjectDocumentFile } from '../../data/objects';

interface BookingTermsCardProps {
  agreement: ObjectDocumentFile | null;
  // Только для черновика продающей страницы (/:slug/draft) — см.
  // src/lib/glass.ts. По умолчанию выключено, чтобы не задеть другие
  // места, где используется этот компонент.
  glass?: boolean;
}

// Рисованная иллюстрация документа (вместо мелкой иконки-щита) — две
// страницы внахлёст с "текстом" в виде полосок и зелёный штамп поверх,
// намекающий на подписание, без внешних картинок.
function DocumentIllustration() {
  return (
    <div className="relative h-24 w-20 shrink-0">
      <div className="absolute inset-0 translate-x-2 translate-y-2 rotate-3 rounded-lg border border-border bg-surface-muted" />
      <div className="absolute inset-0 flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3 shadow-card">
        <span className="h-1.5 w-3/4 rounded-full bg-ink-faint/30" />
        <span className="h-1.5 w-full rounded-full bg-ink-faint/30" />
        <span className="h-1.5 w-full rounded-full bg-ink-faint/30" />
        <span className="h-1.5 w-2/3 rounded-full bg-ink-faint/30" />
        <span className="mt-auto h-1.5 w-1/2 rounded-full bg-primary/30" />
      </div>
      <span className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-success text-white shadow-card">
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    </div>
  );
}

// Блок-развеиватель сомнений рядом с "Бронирование без предоплаты" — даёт
// сразу открыть и прочитать реальный шаблон соглашения о намерениях, а не
// просто поверить на слово. Файл — отдельное поле объекта
// (RealtyObject.intentAgreementFile), а не категория в "Документах объекта":
// это маркетинговый материал для клиента, а не официальный документ вроде
// выписки из реестра, поэтому загружается отдельно в форме объекта.
// Превью рисуется как собственный компонент (IntentAgreementDocument) в
// типографике сайта, а не через нативный PDF-просмотрщик браузера — тот
// нечитаем и подолгу грузится. Загруженный файл остаётся доступен по
// кнопке "Скачать" как оригинал документа.
export function BookingTermsCard({ agreement, glass }: BookingTermsCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const Wrapper: ElementType = glass ? 'div' : Card;

  return (
    <Wrapper
      className={cn('flex flex-col items-start gap-6 p-6 sm:flex-row sm:items-center', glass && glassCardClass)}
      style={glass ? glassCardShadow : undefined}
    >
      <div className="flex flex-1 flex-col gap-2">
        <div className="text-xl font-extrabold text-ink">Бронирование без предоплаты</div>
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p>Бронь оформляется соглашением о намерениях</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Всего 2 страницы</li>
            <li>Без сложных терминов</li>
            <li>Без финансовых обязательств</li>
            <li>Подписание онлайн</li>
          </ul>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-3">
        <DocumentIllustration />
        {agreement ? (
          <Button
            type="button"
            variant="secondary"
            icon={<FileText className="h-4 w-4" />}
            onClick={() => setPreviewOpen(true)}
            className="whitespace-nowrap"
          >
            Посмотреть шаблон
          </Button>
        ) : (
          <p className="max-w-[10rem] text-center text-xs text-ink-faint">Шаблон соглашения скоро появится здесь.</p>
        )}
      </div>

      {previewOpen && agreement && (
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
          </div>
        </div>
      )}
    </Wrapper>
  );
}
