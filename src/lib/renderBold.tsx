import type { ReactNode } from 'react';

// Общий для фронта минимальный markdown: только **жирный текст**, без
// остального синтаксиса — набирается в админке в этой же нотации
// (BusinessCentersAdminTab.tsx). Вынесено из BusinessCenterDetailPage.tsx,
// чтобы им же могли пользоваться блоки в BusinessCenterMarketBlocks.tsx
// без циклического импорта между двумя файлами.
export function renderBold(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}
