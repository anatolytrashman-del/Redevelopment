import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { TelegramCapture, TelegramCaptureRow, TelegramCaptureStatus } from '../data/telegramCaptures';

function fromRow(row: TelegramCaptureRow): TelegramCapture {
  return {
    id: row.id,
    chatId: row.chat_id,
    messageId: row.message_id,
    senderName: row.sender_name ?? '',
    sourceKind: row.source_kind === 'forward' ? 'forward' : 'direct',
    sourceName: row.source_name ?? '',
    sourceUsername: row.source_username ?? '',
    sourceDate: row.source_date ?? null,
    text: row.text ?? '',
    files: row.files ?? [],
    kind: row.kind ?? '',
    summary: row.summary ?? '',
    facts: row.facts ?? [],
    dueDate: row.due_date ?? null,
    counterparty: row.counterparty ?? '',
    status: (row.status as TelegramCaptureStatus) ?? 'new',
    linkedType: row.linked_type ?? '',
    linkedId: row.linked_id ?? null,
    note: row.note ?? '',
    createdAt: row.created_at,
  };
}

// Лента копилки, свежие сверху. Лимит того же порядка, что у почты: это
// лента, а не архив для листания, и PostgREST всё равно отдаёт максимум 1000
// строк за запрос (см. CLAUDE.md).
const CAPTURES_PAGE_SIZE = 500;

export function fetchTelegramCaptures(): Promise<TelegramCapture[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('telegram_captures')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(CAPTURES_PAGE_SIZE);
    if (error) throw error;
    return (data as TelegramCaptureRow[]).map(fromRow);
  });
}

// Меняем только то, что правит человек в интерфейсе: статус, привязку к
// карточке, подпись отправителя (когда Telegram её скрыл) и заметку. Текст,
// файлы и разбор модели не редактируются — это снимок пришедшего.
export interface TelegramCapturePatch {
  status?: TelegramCaptureStatus;
  linkedType?: string;
  linkedId?: string | null;
  sourceName?: string;
  note?: string;
}

export function updateTelegramCapture(id: string, patch: TelegramCapturePatch): Promise<TelegramCapture> {
  return withRetry(async () => {
    const payload: Record<string, unknown> = {};
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.linkedType !== undefined) payload.linked_type = patch.linkedType;
    if (patch.linkedId !== undefined) payload.linked_id = patch.linkedId;
    if (patch.sourceName !== undefined) payload.source_name = patch.sourceName;
    if (patch.note !== undefined) payload.note = patch.note;
    const { data, error } = await supabase
      .from('telegram_captures')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as TelegramCaptureRow);
  });
}

export function deleteTelegramCapture(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('telegram_captures').delete().eq('id', id);
    if (error) throw error;
  });
}
