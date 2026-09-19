// Мостик «в переписке с подрядчиком прочитали письма» → «бейдж в боковом
// меню пересчитайся». Один в один lib/mailboxSeen.ts: у письма есть своя
// колонка read_at в базе, хранить отметку "просмотрено" тут негде и незачем —
// нужен только сигнал сайдбару перезапросить счётчик сразу, не дожидаясь ни
// фокуса окна, ни минутного опроса.
const READ_EVENT = 'work-contractors-read';

export function notifyWorkContractorsRead() {
  window.dispatchEvent(new Event(READ_EVENT));
}

export function onWorkContractorsRead(handler: () => void): () => void {
  window.addEventListener(READ_EVENT, handler);
  return () => window.removeEventListener(READ_EVENT, handler);
}
