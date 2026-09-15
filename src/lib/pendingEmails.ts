// Какие входящие письма ЖДУТ реакции человека — общий счёт для бейджа
// "Письма" (поставщики и подрядчики по работам), для псевдо-категории
// "Непрочитанные" и для красных цифр у тредов.
//
// Владелец, 2026-09-15: "возле вкладки Письма стоит 2 непрочитанных
// сообщения, хотя я уже дал обратную связь на все письма, они просто в
// очереди... хочу, чтобы счётчик содержал только нерешённые вопросы от
// меня, а все решённые мной и автоответы не увеличивали счётчик".
//
// Почему одного read_at не хватает. Отметку "прочитано" ставят ровно два
// пути: человек открыл тред в админке (markSupplier...Read) и SQL-функции
// автоответов (auto_reply_queue — когда ответ поставлен в очередь,
// auto_reply_answer — когда владелец в разборе почты сказал "не отвечаем").
// Мимо обоих проходят два обычных случая:
//   1. Поставщик прислал два письма подряд, а ответили одним — отметку
//      получит только то письмо, на которое отвечали (и почасовой разбор
//      его же и разбирает: письма, за которыми в треде есть более свежее
//      входящее, он сознательно пропускает). Первое висит красным вечно,
//      хотя вопрос закрыт.
//   2. Владелец ответил на тред не из админки, а из разбора почты в Клоде —
//      прочитанным станет ровно одно письмо, предыдущие останутся.
// Поэтому счёт идёт не по письмам, а по ТРЕДАМ: непрочитанным считается
// последнее входящее треда, если после него нет нашего ответа. Ответ в
// очереди ('queued') вопрос закрывает — он уже уйдёт сам; 'failed' не
// закрывает, письмо на самом деле не ушло и вопрос остался.
export interface PendingEmailLike {
  direction: 'in' | 'out';
  readAt: string | null;
  createdAt: string;
  fromAddress: string;
  subject: string;
  sendStatus: 'sent' | 'queued' | 'failed';
}

// Служебный автоответ поставщика ("отсутствую в офисе", "ваше письмо
// принято", отбойник почтового сервера) — отвечать на него некому и
// незачем, в счётчике ему делать нечего. Сам разбор почты такие письма
// тоже не трогает, поэтому без этого фильтра они висели бы красным до
// ручного открытия треда.
const AUTO_REPLY_FROM = /(^|[.@_-])(no-?reply|noreply|mailer-daemon|postmaster|do-?not-?reply)([.@_-]|$)/i;
const AUTO_REPLY_SUBJECT =
  /(автоответ|автоматическ(ий|ое) (ответ|уведомлени)|out of office|automatic reply|auto-?reply|undelivered mail|delivery status notification|mail delivery (failed|subsystem))/i;

export function isServiceAutoReply(email: Pick<PendingEmailLike, 'fromAddress' | 'subject'>): boolean {
  return AUTO_REPLY_FROM.test(email.fromAddress ?? '') || AUTO_REPLY_SUBJECT.test(email.subject ?? '');
}

// threadKey — что считать одним разговором: у поставщиков это предложение
// плюс заявка (offerId + orderId, "1 заявка на поставку — одна ветка"), у
// подрядчиков по работам — сам подрядчик.
export function pendingIncomingEmails<T extends PendingEmailLike>(
  emails: T[],
  threadKey: (email: T) => string,
): T[] {
  const byThread = new Map<string, T[]>();
  for (const email of emails) {
    const key = threadKey(email);
    const thread = byThread.get(key);
    if (thread) thread.push(email);
    else byThread.set(key, [email]);
  }
  const pending: T[] = [];
  for (const thread of byThread.values()) {
    const sorted = [...thread].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    // Последнее входящее, за которым не последовало нашего ответа: любое
    // реально ушедшее (или ждущее очереди) исходящее обнуляет накопленное.
    let awaiting: T | null = null;
    for (const email of sorted) {
      if (email.direction === 'out') {
        if (email.sendStatus !== 'failed') awaiting = null;
        continue;
      }
      awaiting = email;
    }
    if (awaiting && !awaiting.readAt && !isServiceAutoReply(awaiting)) pending.push(awaiting);
  }
  return pending;
}
