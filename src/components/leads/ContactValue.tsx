import { extractTelegramHandle } from '../../lib/telegramHandle';

// Контакт хранит и телефон, и телеграм-юзернейм, и голую ссылку на переписку
// (например, диалог на Kufar) — способ связи (contactMethod) подсказывает,
// как из этого сделать кликабельную ссылку, ведущую сразу в диалог:
// Telegram-юзернейм превращается в t.me-ссылку, любой готовый http(s)-адрес
// (Kufar и т.п.) используется как есть. Номера телефонов ссылкой не
// становятся — с ними это ничего не открывает.
export function buildDialogLink(contactMethod: string, contact: string): string | null {
  if (!contact.trim()) return null;
  if (contactMethod === 'Telegram') {
    const handle = extractTelegramHandle(contact);
    return handle ? `https://t.me/${handle}` : null;
  }
  return /^https?:\/\//i.test(contact.trim()) ? contact.trim() : null;
}

export function ContactValue({ contact, contactMethod }: { contact: string; contactMethod?: string }) {
  if (!contact) return null;
  const href = buildDialogLink(contactMethod ?? '', contact);
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
        {contact}
      </a>
    );
  }
  return <>{contact}</>;
}
