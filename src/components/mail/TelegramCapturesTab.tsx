import { useEffect, useMemo, useState } from 'react';
import { Check, EyeOff, Loader2, Paperclip, Send, Trash2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SearchInput } from '../ui/SearchInput';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';
import {
  deleteTelegramCapture,
  fetchTelegramCaptures,
  updateTelegramCapture,
  type TelegramCapturePatch,
} from '../../lib/telegramCapturesApi';
import { fetchMailboxContacts } from '../../lib/mailboxContactsApi';
import { contactLabel } from '../../data/mailbox';
import { fetchObjects } from '../../lib/objectsApi';
import {
  TELEGRAM_CAPTURE_BOT,
  telegramCaptureKindLabels,
  telegramCaptureTitle,
  type TelegramCapture,
} from '../../data/telegramCaptures';

// Вкладка "Telegram" страницы "Почта" — копилка пересланного боту (см.
// src/data/telegramCaptures.ts, там же почему копилка, а не лента чата).
//
// Вкладка, а не отдельный пункт меню, намеренно: это второй канал того же
// входящего потока, что и общий ящик, с тем же правом доступа ('mailbox') и
// тем же местом, куда владелец заходит смотреть "что мне пришло".

const STATUS_FILTERS = ['Новые', 'Принятые', 'Скрытые', 'Все'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const NO_LINK_LABEL = 'Не привязано';
const MISSING_LINK_LABEL = 'Карточка удалена';

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function fileSizeLabel(size: number): string {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

// Тон бейджа типа по рабочей шкале статусов (см. CLAUDE.md про фирменный
// красный): нейтральное — серым, требующее действия — жёлтым, срок — красным.
// primary здесь не используется вообще: он неотличим от danger и любой
// спокойный тип выглядел бы аварией.
function kindTone(kind: string): 'neutral' | 'warning' | 'danger' | 'success' {
  if (kind === 'deadline') return 'danger';
  if (kind === 'terms' || kind === 'document') return 'warning';
  if (kind === 'contact' || kind === 'idea') return 'success';
  return 'neutral';
}

// Select работает со списком строк, поэтому подпись здесь — и то, что видит
// человек, и ключ обратного поиска. Две карточки с одинаковой подписью
// (два объекта по одному адресу) склеятся в одну опцию — терпимо: выбор
// всё равно подтверждается глазами, а тип и id хранятся отдельно.
interface LinkOption {
  // 'contact' — запись из вкладки «Контакты» того же ящика (бывшие
  // «Коллаборации», слитые сюда 2026-09-16).
  type: 'contact' | 'object';
  id: string;
  label: string;
}

export function TelegramCapturesTab({ onCountsChange }: { onCountsChange?: (newCount: number) => void }) {
  const [captures, setCaptures] = useState<TelegramCapture[]>([]);
  const [linkOptions, setLinkOptions] = useState<LinkOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>(STATUS_FILTERS[0]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchTelegramCaptures()
      .then((rows) => {
        if (cancelled) return;
        setCaptures(rows);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorText(err, 'Не удалось загрузить копилку'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Списки для привязки грузим отдельно и молча: без них копилку всё равно
  // можно читать и разбирать, просто селект будет пустым.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMailboxContacts(), fetchObjects()])
      .then(([contacts, objects]) => {
        if (cancelled) return;
        setLinkOptions([
          ...contacts.map((item) => ({
            type: 'contact' as const,
            id: item.id,
            label: `Контакт: ${contactLabel(item)}`,
          })),
          ...objects.map((item) => ({
            type: 'object' as const,
            id: item.id,
            label: `Объект: ${item.name || item.address}`,
          })),
        ]);
      })
      .catch(() => {
        if (!cancelled) setLinkOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const newCount = useMemo(() => captures.filter((c) => c.status === 'new').length, [captures]);
  useEffect(() => {
    onCountsChange?.(newCount);
  }, [newCount, onCountsChange]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return captures.filter((capture) => {
      if (status === 'Новые' && capture.status !== 'new') return false;
      if (status === 'Принятые' && capture.status !== 'accepted') return false;
      if (status === 'Скрытые' && capture.status !== 'dismissed') return false;
      if (!needle) return true;
      const haystack = [
        capture.text,
        capture.summary,
        capture.counterparty,
        capture.note,
        telegramCaptureTitle(capture),
        ...capture.facts,
        ...capture.files.map((f) => f.fileName),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [captures, status, search]);

  async function patch(capture: TelegramCapture, body: TelegramCapturePatch) {
    setBusyId(capture.id);
    setActionError(null);
    try {
      const updated = await updateTelegramCapture(capture.id, body);
      setCaptures((prev) => prev.map((item) => (item.id === capture.id ? updated : item)));
    } catch (err) {
      setActionError(errorText(err, 'Не удалось сохранить изменение'));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(capture: TelegramCapture) {
    if (!window.confirm('Удалить запись из копилки? Файл в хранилище останется.')) return;
    setBusyId(capture.id);
    setActionError(null);
    try {
      await deleteTelegramCapture(capture.id);
      setCaptures((prev) => prev.filter((item) => item.id !== capture.id));
    } catch (err) {
      setActionError(errorText(err, 'Не удалось удалить запись'));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Загружаем копилку...
      </Card>
    );
  }
  if (loadError) return <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Поиск по тексту, файлам, фактам"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          wrapperClassName="min-w-[260px] flex-1"
        />
        <Select
          pill
          options={[...STATUS_FILTERS]}
          value={status}
          onChange={(value) => setStatus(value as StatusFilter)}
          triggerClassName="min-w-[160px]"
        />
        <span className="text-sm text-ink-muted">
          {visible.length === captures.length
            ? `Записей: ${captures.length}`
            : `Показано: ${visible.length} из ${captures.length}`}
        </span>
      </div>

      {actionError && <Card className="py-3 text-center text-sm text-danger">{actionError}</Card>}

      {visible.length === 0 && (
        <Card className="flex flex-col items-center gap-2 py-10 text-center text-sm text-ink-muted">
          <Send className="h-5 w-5 text-ink-faint" />
          {captures.length === 0 ? (
            <>
              <span>Копилка пуста.</span>
              <span>
                Перешлите боту{TELEGRAM_CAPTURE_BOT ? ` ${TELEGRAM_CAPTURE_BOT}` : ''} любое сообщение или файл из
                диалога — оно появится здесь с короткой выжимкой.
              </span>
            </>
          ) : (
            <span>Под фильтр ничего не подходит.</span>
          )}
        </Card>
      )}

      {visible.map((capture) => {
        const busy = busyId === capture.id;
        const linked = capture.linkedId
          ? linkOptions.find((option) => option.type === capture.linkedType && option.id === capture.linkedId)
          : null;
        // Привязка могла указывать на удалённую карточку: id в копилке есть, а
        // самой карточки уже нет (FK намеренно нет — копилка переживает
        // удаление). Молча показать "Не привязано" нельзя, это выглядит как
        // потерянная работа, поэтому для такого случая отдельная подпись.
        const linkMissing = Boolean(capture.linkedId) && !linked;
        const linkLabel = linked ? linked.label : linkMissing ? MISSING_LINK_LABEL : NO_LINK_LABEL;
        return (
          <Card key={capture.id} className={cn('flex flex-col gap-3', busy && 'opacity-60')}>
            <div className="flex flex-wrap items-center gap-2">
              {capture.status === 'new' && <Badge tone="warning">Новое</Badge>}
              <span className="font-semibold text-ink">{telegramCaptureTitle(capture)}</span>
              {capture.sourceUsername && (
                <a
                  href={`https://t.me/${capture.sourceUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-ink-muted underline-offset-2 hover:underline"
                >
                  @{capture.sourceUsername}
                </a>
              )}
              {/* Тип "Срок" рядом с бейджем самой даты — два бейджа об одном и
                  том же; на мобильном они ещё и занимают целую строку.
                  Показываем только дату, она информативнее. */}
              {capture.kind && !(capture.kind === 'deadline' && capture.dueDate) && (
                <Badge tone={kindTone(capture.kind)}>{telegramCaptureKindLabels[capture.kind] ?? capture.kind}</Badge>
              )}
              {capture.dueDate && <Badge tone="danger">Срок: {new Date(capture.dueDate).toLocaleDateString('ru-RU')}</Badge>}
              <span className="ml-auto text-xs text-ink-faint">
                {new Date(capture.sourceDate ?? capture.createdAt).toLocaleString('ru-RU')}
              </span>
            </div>

            {capture.summary && <p className="text-sm font-medium text-ink">{capture.summary}</p>}
            {capture.text && <p className="whitespace-pre-wrap text-sm text-ink-muted">{capture.text}</p>}

            {capture.facts.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-control bg-surface-muted p-3 text-sm text-ink-muted">
                {capture.facts.map((fact, index) => (
                  <li key={index}>• {fact}</li>
                ))}
              </ul>
            )}

            {capture.files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {capture.files.map((file) => (
                  <a
                    key={file.url}
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink hover:border-border-strong"
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                    <span className="max-w-[16rem] truncate">{file.fileName}</span>
                    {file.size > 0 && <span className="text-xs text-ink-faint">{fileSizeLabel(file.size)}</span>}
                  </a>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Select
                placeholder={NO_LINK_LABEL}
                options={[NO_LINK_LABEL, ...(linkMissing ? [MISSING_LINK_LABEL] : []), ...linkOptions.map((o) => o.label)]}
                value={linkLabel}
                onChange={(label) => {
                  const picked = linkOptions.find((option) => option.label === label);
                  void patch(capture, {
                    linkedType: picked ? picked.type : '',
                    linkedId: picked ? picked.id : null,
                  });
                }}
                triggerClassName="min-w-[220px]"
              />

              <Input
                className="min-w-[12rem] flex-1"
                defaultValue={capture.note}
                placeholder="Заметка"
                onBlur={(event) => {
                  const value = event.target.value;
                  if (value !== capture.note) void patch(capture, { note: value });
                }}
              />

              {capture.status !== 'accepted' && (
                <Button
                  variant="secondary"
                  icon={<Check className="h-4 w-4" />}
                  disabled={busy}
                  onClick={() => void patch(capture, { status: 'accepted' })}
                >
                  Разобрано
                </Button>
              )}
              {capture.status !== 'dismissed' && (
                <Button
                  variant="ghost"
                  icon={<EyeOff className="h-4 w-4" />}
                  disabled={busy}
                  onClick={() => void patch(capture, { status: 'dismissed' })}
                >
                  Скрыть
                </Button>
              )}
              <Button
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                disabled={busy}
                onClick={() => void remove(capture)}
              >
                Удалить
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
