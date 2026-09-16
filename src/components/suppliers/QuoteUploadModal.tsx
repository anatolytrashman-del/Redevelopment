import { useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, FileUp, Loader2, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/cn';
import { currencySymbols, type Currency } from '../../data/transactions';
import {
  isQuoteFileName,
  routeUploadedQuote,
  uploadQuoteFile,
  type QuoteAmbiguousResult,
  type QuoteAppliedResult,
  type QuoteUploadResult,
} from '../../lib/quoteUploadApi';

// «Загрузить КП» — один диалог на всю страницу закупок (владелец, 2026-09-16:
// «ручная загрузка новых КП от поставщиков в 1 клик, чтобы система сама
// понимала, к какой поставке это относится и к какому поставщику»).
//
// Весь ввод здесь — это выбор файлов. Ни поставку, ни поставщика человек
// заранее не указывает: их определяет сервер по самому документу
// (api/_invoiceRouting.js). Вопрос задаётся ТОЛЬКО когда уверенного ответа
// нет — тогда вместо результата показывается список поставок-кандидатов, и
// один клик по нужной дописывает счёт туда.
//
// Файлы обрабатываются по очереди, а не Promise.all: распознавание идёт
// через модель, десять параллельных документов — это десять одновременных
// запросов к шлюзу и перемешанные строки результата, по которым непонятно,
// что к чему относится.

type FileState =
  | { stage: 'uploading' }
  | { stage: 'reading' }
  | { stage: 'applying' }
  | { stage: 'done'; result: QuoteAppliedResult }
  | { stage: 'ask'; result: QuoteAmbiguousResult; fileUrl: string }
  | { stage: 'skipped'; reason: string }
  | { stage: 'error'; message: string };

interface Row {
  id: string;
  fileName: string;
  state: FileState;
}

function formatMoney(price: number | null, currency: string | null): string {
  if (price == null) return 'сумма не указана';
  const symbol = currency && currency in currencySymbols ? currencySymbols[currency as Currency] : (currency ?? '');
  const value = price.toLocaleString('ru-RU');
  return currency === 'USD' ? `${symbol}${value}` : `${value} ${symbol}`.trim();
}

const MATCHED_BY_NOTE: Record<string, string> = {
  inn: 'поставщик найден по ИНН из счёта',
  name: 'поставщик найден по названию из счёта',
  site: 'поставщик найден по домену сайта или почты',
  manual: 'поставку выбрали вы',
};

export function QuoteUploadModal({
  open,
  onClose,
  onApplied,
  onOpenOffer,
}: {
  open: boolean;
  onClose: () => void;
  // Счёт записан — странице пора перечитать поставщиков и КП, чтобы «Сравнение
  // цен» пересчиталось без перезагрузки.
  onApplied: () => void;
  onOpenOffer: (offerId: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function patch(id: string, state: FileState) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, state } : r)));
  }

  async function handleFiles(files: File[]) {
    const accepted = files.filter((f) => isQuoteFileName(f.name));
    const rejected = files.filter((f) => !isQuoteFileName(f.name));
    const fresh: Row[] = [
      ...accepted.map((f) => ({ id: crypto.randomUUID(), fileName: f.name, state: { stage: 'uploading' } as FileState })),
      ...rejected.map((f) => ({
        id: crypto.randomUUID(),
        fileName: f.name,
        state: { stage: 'skipped', reason: 'Такой формат не читается — нужен PDF, картинка, .docx или .xlsx' } as FileState,
      })),
    ];
    if (fresh.length === 0) return;
    setRows((prev) => [...prev, ...fresh]);
    setBusy(true);
    try {
      for (let i = 0; i < accepted.length; i += 1) {
        const row = fresh[i];
        const file = accepted[i];
        try {
          const uploaded = await uploadQuoteFile(file);
          patch(row.id, { stage: 'reading' });
          const result = await routeUploadedQuote({ fileUrl: uploaded.url, fileName: uploaded.fileName });
          absorb(row.id, result, uploaded.url);
        } catch (err) {
          patch(row.id, { stage: 'error', message: err instanceof Error ? err.message : 'Не удалось загрузить документ' });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function absorb(rowId: string, result: QuoteUploadResult, fileUrl: string) {
    if (result.status === 'applied') {
      patch(rowId, { stage: 'done', result });
      onApplied();
      return;
    }
    if (result.status === 'ambiguous') {
      patch(rowId, { stage: 'ask', result, fileUrl });
      return;
    }
    patch(rowId, { stage: 'skipped', reason: 'Это не счёт и не КП — ничего не записано' });
  }

  // Человек выбрал поставку из кандидатов. Распознанное отправляем обратно
  // тем же, что прислал сервер: документ уже прочитан, платить за второй
  // проход модели не за что.
  async function chooseCandidate(row: Row, candidate: { requestId: string; offerId: string | null }) {
    if (row.state.stage !== 'ask') return;
    const { result, fileUrl } = row.state;
    patch(row.id, { stage: 'applying' });
    setBusy(true);
    try {
      const applied = await routeUploadedQuote({
        fileUrl,
        fileName: result.fileName,
        recognized: result.recognized,
        ...(candidate.offerId ? { offerId: candidate.offerId } : { requestId: candidate.requestId }),
      });
      absorb(row.id, applied, fileUrl);
    } catch (err) {
      patch(row.id, { stage: 'error', message: err instanceof Error ? err.message : 'Не удалось записать КП' });
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy) return;
    setRows([]);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Загрузить КП">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          Положите сюда счёт или коммерческое предложение — система прочитает документ и сама определит, от какого
          поставщика он и к какой поставке относится. Цены сразу попадут в «Сравнение цен».
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFiles(Array.from(e.dataTransfer.files ?? []));
          }}
          className={cn(
            'flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-8 text-center transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-border',
          )}
        >
          <Upload className={cn('h-7 w-7', dragOver ? 'text-primary' : 'text-ink-muted')} />
          <div className="text-sm text-ink-muted">Перетащите файлы сюда — можно несколько сразу</div>
          <Button
            type="button"
            variant="secondary"
            icon={<FileUp className="h-4 w-4" />}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Выбрать файлы
          </Button>
          <div className="text-xs text-ink-muted">PDF, фото или скриншот, .docx, .xlsx</div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = '';
              void handleFiles(picked);
            }}
          />
        </div>

        {rows.length > 0 && (
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-control border border-border bg-surface px-4 py-3">
                <div className="truncate text-sm font-semibold text-ink">{row.fileName}</div>
                <RowBody row={row} onChoose={(c) => void chooseCandidate(row, c)} onOpenOffer={onOpenOffer} busy={busy} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function RowBody({
  row,
  onChoose,
  onOpenOffer,
  busy,
}: {
  row: Row;
  onChoose: (candidate: { requestId: string; offerId: string | null }) => void;
  onOpenOffer: (offerId: string) => void;
  busy: boolean;
}) {
  const state = row.state;

  if (state.stage === 'uploading' || state.stage === 'reading' || state.stage === 'applying') {
    const label =
      state.stage === 'uploading' ? 'Загружаем файл...' : state.stage === 'reading' ? 'Читаем документ...' : 'Записываем КП...';
    return (
      <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {label}
      </div>
    );
  }

  if (state.stage === 'error') {
    return <div className="mt-1 text-xs text-danger">{state.message}</div>;
  }

  if (state.stage === 'skipped') {
    return <div className="mt-1 text-xs text-ink-muted">{state.reason}</div>;
  }

  if (state.stage === 'ask') {
    const { supplier, candidates } = state.result;
    return (
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-start gap-2 text-xs text-ink-muted">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            Счёт прочитан{supplier.name ? `: ${supplier.name}` : ''}. К какой поставке он относится, уверенно не
            определилось — выберите:
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {candidates.map((c) => (
            <button
              key={`${c.requestId}-${c.offerId ?? 'new'}`}
              type="button"
              disabled={busy}
              onClick={() => onChoose({ requestId: c.requestId, offerId: c.offerId })}
              className="flex items-center justify-between gap-3 rounded-control border border-border px-3 py-2 text-left text-sm text-ink transition-colors hover:border-border-strong disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {c.requestTitle}
                  {c.recommended && <span className="ml-2 text-xs font-semibold text-primary">похоже, сюда</span>}
                </span>
                <span className="block truncate text-xs text-ink-muted">
                  {c.offerId ? `карточка «${c.supplierName}» уже есть` : 'заведём новую карточку поставщика'}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  const { result } = state;
  return (
    <div className="mt-1 flex flex-col gap-1 text-xs">
      <div className="flex items-center gap-2 text-ink">
        <Check className="h-3.5 w-3.5 shrink-0 text-success" />
        <span className="min-w-0 truncate">
          <span className="font-semibold">{result.supplierName}</span> → {result.requestTitle}
        </span>
      </div>
      <div className="text-ink-muted">
        {formatMoney(result.price, result.currency)} · позиций {result.itemsCount}
        {result.itemsCount > 0 && `, сопоставлено с ведомостью ${result.matchedCount}`}
        {result.createdOffer && ' · заведена новая карточка поставщика'}
      </div>
      {result.matchedBy && MATCHED_BY_NOTE[result.matchedBy] && (
        <div className="text-ink-muted">{MATCHED_BY_NOTE[result.matchedBy]}</div>
      )}
      {/* Позиции без привязки к ведомости в сравнение не попадут — это надо
          сказать прямо, а не оставить закупщице искать, почему в таблице
          пусто. Дальше их привязывает кнопка «Предложить сопоставление» в
          самой карточке поставки (а если ведомости нет вовсе — сначала
          привязка раздела сметы, прямо в той же карточке). */}
      {result.itemsCount > 0 && result.matchedCount === 0 && (
        <div className="text-warning">
          {result.hasLedger
            ? 'Ни одна строка не легла на позиции ведомости — цены записаны, но в таблицу сравнения попадут только после сопоставления.'
            : 'У этой поставки не привязан раздел сметы, сравнивать не с чем — цены записаны, в таблицу они попадут после привязки ведомости.'}
        </div>
      )}
      <button
        type="button"
        onClick={() => onOpenOffer(result.offerId)}
        className="w-fit text-xs font-medium text-primary hover:underline"
      >
        Открыть карточку поставщика
      </button>
    </div>
  );
}
