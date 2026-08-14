import { useState } from 'react';
import { Download, FileText, ShieldCheck, X } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { IntentAgreementDocument } from './IntentAgreementDocument';
import type { ObjectDocumentFile } from '../../data/objects';

interface BookingTermsCardProps {
  agreement: ObjectDocumentFile | null;
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
export function BookingTermsCard({ agreement }: BookingTermsCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <Card className="flex flex-col items-start gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2">
        <div className="text-xl font-extrabold text-ink">Бронирование без предоплаты</div>
        <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
          <p>Бронь оформляется соглашением о намерениях</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Всего 2 страницы</li>
            <li>Без сложных терминов</li>
            <li>Без финансовых обязательств</li>
          </ul>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-2">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-ink">
          <ShieldCheck className="h-5 w-5" />
        </span>
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
    </Card>
  );
}
