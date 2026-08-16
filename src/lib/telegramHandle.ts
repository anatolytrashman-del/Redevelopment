// Юзернейм Telegram из значения поля "Контакт": снимает @/https://t.me/ и
// подобные префиксы, проверяет по формату, который требует сам Telegram
// (5–32 символа, начинается с буквы). Общий код для кликабельной ссылки на
// диалог (ContactValue.tsx) и автоподтягивания аватара (leadsApi.ts) —
// раньше эта регулярка была только внутри buildDialogLink.
export function extractTelegramHandle(contact: string): string | null {
  const trimmed = contact.trim();
  if (!trimmed) return null;
  const handle = trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/^(t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '');
  return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(handle) ? handle : null;
}
