import { useEffect, useState } from 'react';
import { insertSupplierMenuCapture } from './supplierMenuCapturesApi';
import { upsertSupplierContactCapture, type SupplierContactCaptureKind } from './supplierContactCapturesApi';

// Приём того, что закладки (tools/menu-bookmarklet) снимают прямо со
// страницы поставщика: дерево разделов каталога («Снять меню») и контакты по
// клику («Снять контакт»).
//
// Живёт на уровне всей админки (AppLayout), а не внутри вкладки
// «Верификация». Первая версия слушала сообщение прямо во вкладке — и это
// оказалось главной причиной, по которой у владельца «всё равно выдаётся
// старая версия» (2026-09-14): стоит админке показывать любую другую
// страницу или даже соседнюю вкладку раздела «Закупки», как компонент со
// слушателем размонтирован, принимать некому, закладка не получает ответа и
// показывает запасное окно с копированием. Теперь слушатель есть всегда,
// пока открыта админка.
//
// Сообщение приходит с ЧУЖОГО домена (сайт поставщика), поэтому доверять
// origin нельзя — проверяется форма данных: своя метка, строковый хост,
// непустое значение. Худшее, что может сделать посторонняя страница, —
// записать строку-заготовку в отдельную таблицу, которую всё равно
// проверяют глазами перед тем, как пустить в карточку.
export const MENU_CAPTURE_MESSAGE = 'redevelopment-menu-capture';
export const CONTACT_CAPTURE_MESSAGE = 'redevelopment-contact-capture';
export const MENU_CAPTURE_ACK = 'redevelopment-menu-capture-ok';
// События для тех, кто показывает снятое (вкладка «Верификация») — чтобы
// обновиться, не заводя второго слушателя сообщений и не рискуя записать
// одну и ту же посылку дважды.
export const MENU_CAPTURE_SAVED_EVENT = 'supplier-menu-capture-saved';
export const CONTACT_CAPTURE_SAVED_EVENT = 'supplier-contact-capture-saved';

// Телефон приводим к тому виду, в котором номера уже лежат в базе
// (+7 (495) 545-45-53 — самый частый формат у существующих карточек):
// иначе один и тот же номер, снятый кликом и вписанный руками, выглядел бы
// как два разных.
export function normalizeCapturedPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const ru = digits.length === 11 && (digits[0] === '7' || digits[0] === '8')
    ? `7${digits.slice(1)}`
    : digits.length === 10
      ? `7${digits}`
      : '';
  if (ru) return `+7 (${ru.slice(1, 4)}) ${ru.slice(4, 7)}-${ru.slice(7, 9)}-${ru.slice(9, 11)}`;
  if (digits.length === 12 && digits.startsWith('375')) {
    return `+375 (${digits.slice(3, 5)}) ${digits.slice(5, 8)}-${digits.slice(8, 10)}-${digits.slice(10, 12)}`;
  }
  if (digits.length === 11 && digits.startsWith('80')) {
    const by = digits.slice(2);
    return `+375 (${by.slice(0, 2)}) ${by.slice(2, 5)}-${by.slice(5, 7)}-${by.slice(7, 9)}`;
  }
  return digits ? `+${digits}` : raw.trim();
}

function ack(source: MessageEventSource | null, text: string, count: number) {
  if (!source) return;
  (source as Window).postMessage({ source: MENU_CAPTURE_ACK, count, text }, '*');
}

export function useMenuCaptureReceiver(): string {
  const [toast, setToast] = useState('');

  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      const d = e.data as Record<string, unknown> | null;
      if (!d) return;
      const host = typeof d.host === 'string' ? d.host.trim().toLowerCase() : '';
      const pageUrl = typeof d.pageUrl === 'string' ? d.pageUrl.slice(0, 500) : '';
      if (!host) return;

      if (d.source === MENU_CAPTURE_MESSAGE) {
        const tree = typeof d.tree === 'string' ? d.tree.trim() : '';
        if (!tree) return;
        const count = tree.split('\n').filter((l) => l.trim()).length;
        try {
          await insertSupplierMenuCapture({ host, pageUrl, tree, sectionsCount: count });
          setToast(`${host}: снято ${count} разделов`);
          window.dispatchEvent(new CustomEvent(MENU_CAPTURE_SAVED_EVENT));
          // Ответ закладке — она покажет подтверждение прямо на сайте
          // поставщика, чтобы не переключать вкладку ради проверки.
          ack(e.source, `Меню снято: ${count} разделов`, count);
        } catch {
          setToast(`${host}: не удалось сохранить меню`);
        }
        return;
      }

      if (d.source === CONTACT_CAPTURE_MESSAGE) {
        const kind = d.kind === 'phone' || d.kind === 'email' || d.kind === 'messenger'
          ? (d.kind as SupplierContactCaptureKind)
          : null;
        const rawValue = typeof d.value === 'string' ? d.value.trim() : '';
        if (!kind || !rawValue) return;
        const messengerType = typeof d.messengerType === 'string' ? d.messengerType.trim() : '';
        if (kind === 'messenger' && !['Telegram', 'WhatsApp', 'Max'].includes(messengerType)) return;
        const value = kind === 'phone'
          ? normalizeCapturedPhone(rawValue)
          : kind === 'email'
            ? rawValue.toLowerCase()
            : rawValue;
        const label = kind === 'phone' ? 'Телефон' : kind === 'email' ? 'Почта' : messengerType;
        try {
          const saved = await upsertSupplierContactCapture({
            host,
            kind,
            value,
            messengerType: kind === 'messenger' ? messengerType : '',
            rawText: typeof d.rawText === 'string' ? d.rawText.slice(0, 300) : '',
            pageUrl,
          });
          setToast(`${host}: ${label.toLowerCase()} ${value}`);
          window.dispatchEvent(new CustomEvent(CONTACT_CAPTURE_SAVED_EVENT, { detail: saved }));
          ack(e.source, `${label}: ${value}`, 1);
        } catch {
          setToast(`${host}: не удалось сохранить контакт`);
        }
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  return toast;
}
