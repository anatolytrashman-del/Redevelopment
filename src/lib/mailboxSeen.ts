// Мостик «в ящике прочитали письма» → «бейдж в боковом меню пересчитайся».
// В отличие от лидов и бэклога (там отметка о просмотре лежит в localStorage,
// потому что у строки нет своего признака «прочитано»), у письма есть колонка
// read_at в самой базе — хранить здесь нечего, нужен только сигнал: страница
// «Почта» погасила тред, сайдбару пора перезапросить счётчик, не дожидаясь
// ни фокуса окна, ни минутного опроса.
const READ_EVENT = 'mailbox-read';

export function notifyMailboxRead() {
  window.dispatchEvent(new Event(READ_EVENT));
}

export function onMailboxRead(handler: () => void): () => void {
  window.addEventListener(READ_EVENT, handler);
  return () => window.removeEventListener(READ_EVENT, handler);
}
