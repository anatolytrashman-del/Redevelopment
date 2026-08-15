// Общие классы для эффекта "жидкое стекло" (Apple Liquid Glass) — впервые
// появились на продающей странице (/:slug и /:slug/draft), теперь это же
// дефолтный вид всей админки (Card, Modal, Sidebar и т.д.), см. эти файлы.
// Вынесено сюда, чтобы оба контекста не расходились в оттенках/тенях.
export const glassCardClass =
  'rounded-3xl border border-white/60 bg-white/40 backdrop-blur-xl backdrop-saturate-150';
export const glassCardShadow = {
  boxShadow: '0 8px 32px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.7)',
};

export const glassPillClass =
  'rounded-full border border-white/50 bg-white/30 backdrop-blur-xl backdrop-saturate-150';
export const glassPillShadow = {
  boxShadow: '0 8px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6)',
};
