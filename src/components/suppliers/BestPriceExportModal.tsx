import { useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/cn';
import { buildBestPriceHtml, type BestPriceSection } from './bestPriceReport';

// Диалог выгрузки «лучшие цены: оригинал и аналог» (владелец, 2026-09-16:
// «возможность выгрузить именно такую ведомость или в целом по всему, или
// по нужной поставке»).
//
// Два охвата в одном диалоге, а не две разные кнопки с разным поведением:
// открывается он и из карточки поставки (тогда её поставка уже отмечена),
// и с самой вкладки «Сравнение цен» (тогда отмечены все). Позиции можно
// снимать по одной — это тот самый живой случай, ради которого документ и
// понадобился: запрос уходит «на всё, кроме керамогранита Alma Ceramica»,
// и лишняя строка в таблице сбивает поставщика с толку.
export function BestPriceExportModal({
  open,
  onClose,
  sections,
  initialRequestId,
  preparedBy,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  sections: BestPriceSection[];
  initialRequestId?: string;
  preparedBy: string;
  onError: (message: string) => void;
}) {
  const [scope, setScope] = useState<'one' | 'all'>(initialRequestId ? 'one' : 'all');
  const [requestId, setRequestId] = useState(initialRequestId ?? sections[0]?.requestId ?? '');
  // Сняты вручную — остальные считаются выбранными. Так новая позиция,
  // появившаяся в ведомости между открытиями диалога, попадает в документ
  // сама, а не теряется молча.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => (scope === 'one' ? sections.filter((s) => s.requestId === requestId) : sections),
    [scope, requestId, sections],
  );
  const chosen = useMemo(
    () =>
      visible
        .map((s) => ({ ...s, rows: s.rows.filter((r) => !excluded.has(r.position.id)) }))
        .filter((s) => s.rows.length > 0),
    [visible, excluded],
  );
  const chosenCount = chosen.reduce((n, s) => n + s.rows.length, 0);
  const withPrice = chosen.reduce((n, s) => n + s.rows.filter((r) => r.original || r.alternative).length, 0);

  function toggle(positionId: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(positionId)) next.delete(positionId);
      else next.add(positionId);
      return next;
    });
  }

  function toggleSection(section: BestPriceSection, on: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev);
      section.rows.forEach((r) => (on ? next.delete(r.position.id) : next.add(r.position.id)));
      return next;
    });
  }

  function exportPdf() {
    if (chosenCount === 0) return;
    const win = window.open('', '_blank', 'width=1200,height=900');
    if (!win) {
      onError('Браузер заблокировал окно печати — разрешите всплывающие окна для этого сайта.');
      return;
    }
    win.document.write(
      buildBestPriceHtml({
        sections: chosen,
        scopeTitle: scope === 'one' ? (chosen[0]?.title ?? 'Лучшие цены') : 'Лучшие цены по всем поставкам',
        preparedBy,
        rate: undefined,
      }),
    );
    win.document.close();
    win.focus();
    // Пауза — на подгрузку Montserrat: без неё Safari печатает системным
    // шрифтом (тот же приём в priceComparisonPrint).
    setTimeout(() => win.print(), 500);
  }

  return (
    <Modal open={open} onClose={onClose} title="Выгрузить лучшие цены">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          Таблица «позиция — лучшая цена на оригинал и на аналог» с пометками, чем аналог отличается. Открывается окном
          печати: сохраните в PDF и прикладывайте к письму поставщику.
        </p>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Охват</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm',
                scope === 'all' ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-border text-ink-muted',
              )}
            >
              Все поставки ({sections.length})
            </button>
            <button
              type="button"
              onClick={() => setScope('one')}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm',
                scope === 'one' ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-border text-ink-muted',
              )}
            >
              Одна поставка
            </button>
          </div>
          {scope === 'one' && (
            <select
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              className="rounded-control border border-border bg-white px-3 py-2 text-sm text-ink"
            >
              {sections.map((s) => (
                <option key={s.requestId} value={s.requestId}>
                  {s.title} — позиций: {s.rows.length}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Позиции в документе</div>
            <div className="text-xs text-ink-faint">
              {chosenCount} выбрано, с ценами {withPrice}
            </div>
          </div>
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto rounded-control border border-border p-3">
            {visible.length === 0 && <div className="text-sm text-ink-muted">Нечего выгружать: поставка без позиций.</div>}
            {visible.map((section) => {
              const allOn = section.rows.every((r) => !excluded.has(r.position.id));
              return (
                <div key={section.requestId} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-ink">{section.title}</span>
                    <button
                      type="button"
                      onClick={() => toggleSection(section, !allOn)}
                      className="shrink-0 text-xs text-primary hover:underline"
                    >
                      {allOn ? 'снять все' : 'выбрать все'}
                    </button>
                  </div>
                  {section.rows.map((row) => {
                    const on = !excluded.has(row.position.id);
                    const prices = [row.original && 'оригинал', row.alternative && 'аналог'].filter(Boolean).join(' · ');
                    return (
                      <label key={row.position.id} className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                        <input type="checkbox" checked={on} onChange={() => toggle(row.position.id)} className="mt-1" />
                        <span className="min-w-0">
                          <span className={cn('block truncate', !on && 'text-ink-faint line-through')}>{row.position.name}</span>
                          <span className="block text-[11px] text-ink-faint">
                            {prices || 'цен пока нет'}
                            {row.position.quantity != null ? ` · ${row.position.quantity.toLocaleString('ru-RU')} ${row.position.unit}` : ''}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" icon={<FileDown className="h-4 w-4" />} onClick={exportPdf} disabled={chosenCount === 0}>
            Открыть PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
}
