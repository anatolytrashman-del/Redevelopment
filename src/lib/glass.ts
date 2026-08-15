// Общие классы для эффекта "жидкое стекло" (Apple Liquid Glass) — впервые
// появились на продающей странице (/:slug), теперь это же дефолтный вид
// всей админки (Card, Modal, Sidebar и т.д.), см. эти файлы.
// Вынесено сюда, чтобы оба контекста не расходились в оттенках/тенях.
// На мобильном карточки почти во всю ширину экрана — вокруг них не остаётся
// широких серых полей, которые на десктопе и создают ощущение контраста
// "стекло на фоне". Компенсируем более плотным фоном/рамкой ниже sm (то же
// backdrop-blur, просто меньше видно сквозь него) — от sm и шире значения
// прежние, ничего в уже одобренном десктопном виде не меняется.
export const glassCardClass =
  'rounded-3xl border border-white/80 bg-white/60 backdrop-blur-xl backdrop-saturate-150 sm:border-white/60 sm:bg-white/40';
export const glassCardShadow = {
  boxShadow: '0 8px 32px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.7)',
};

export const glassPillClass =
  'rounded-full border border-white/70 bg-white/50 backdrop-blur-xl backdrop-saturate-150 sm:border-white/50 sm:bg-white/30';
export const glassPillShadow = {
  boxShadow: '0 8px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6)',
};
