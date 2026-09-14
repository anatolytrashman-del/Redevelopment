import { useEffect, useState } from 'react';
import { insertSupplierMenuCapture } from './supplierMenuCapturesApi';

// Приём дерева разделов от закладки «Снять меню» (tools/menu-bookmarklet).
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
// непустое дерево. Худшее, что может сделать посторонняя страница, —
// записать строку-заготовку в отдельную таблицу, которую всё равно
// проверяют глазами перед тем, как пустить разделы в улики.
export const MENU_CAPTURE_MESSAGE = 'redevelopment-menu-capture';
export const MENU_CAPTURE_ACK = 'redevelopment-menu-capture-ok';
// Событие для тех, кто показывает список снятого (вкладка «Верификация») —
// чтобы обновиться, не заводя второго слушателя сообщений и не рискуя
// записать одну и ту же посылку дважды.
export const MENU_CAPTURE_SAVED_EVENT = 'supplier-menu-capture-saved';

export function useMenuCaptureReceiver(): string {
  const [toast, setToast] = useState('');

  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      const d = e.data as { source?: unknown; host?: unknown; tree?: unknown; pageUrl?: unknown } | null;
      if (!d || d.source !== MENU_CAPTURE_MESSAGE) return;
      const host = typeof d.host === 'string' ? d.host.trim().toLowerCase() : '';
      const tree = typeof d.tree === 'string' ? d.tree.trim() : '';
      if (!host || !tree) return;
      const count = tree.split('\n').filter((l) => l.trim()).length;
      try {
        await insertSupplierMenuCapture({
          host,
          pageUrl: typeof d.pageUrl === 'string' ? d.pageUrl.slice(0, 500) : '',
          tree,
          sectionsCount: count,
        });
        setToast(`${host}: снято ${count} разделов`);
        window.dispatchEvent(new CustomEvent(MENU_CAPTURE_SAVED_EVENT));
        // Ответ закладке — она покажет подтверждение прямо на сайте
        // поставщика, чтобы не переключать вкладку ради проверки.
        if (e.source) (e.source as Window).postMessage({ source: MENU_CAPTURE_ACK, count }, '*');
      } catch {
        setToast(`${host}: не удалось сохранить меню`);
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
